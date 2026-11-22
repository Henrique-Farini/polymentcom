import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { bolsaContext, polyContext, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { getAssetDetail } from "@/lib/bolsa/server";
import { getMarketDetail } from "@/lib/polymarket/server";
import { scoreBolsa } from "@/lib/score/bolsa";
import { scorePoly } from "@/lib/score/polymarket";
import {
  DEFAULT_BOLSA_SETTINGS,
  DEFAULT_POLY_SETTINGS,
  type BolsaSettings,
  type PolySettings,
} from "@/lib/score/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";

interface Body {
  area: "bolsa" | "polymarket";
  id: string;
  settings?: unknown;
}

function mergeSettings<T extends object>(defaults: T, input: unknown): T {
  if (!input || typeof input !== "object") return defaults;
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const d = (defaults as Record<string, unknown>)[k];
    if (typeof d === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    if (d && typeof d === "object" && v && typeof v === "object") out[k] = mergeSettings(d as object, v);
  }
  return out as T;
}

/** Monta o texto com os dados atuais. O servidor busca os dados de novo; o navegador só manda o id. */
async function buildContext(body: Body): Promise<string> {
  if (body.area === "polymarket") {
    if (!/^\d+$/.test(body.id)) throw new Error("id inválido");
    const settings = mergeSettings<PolySettings>(DEFAULT_POLY_SETTINGS, body.settings);
    const d = (await getMarketDetail(body.id, "1s")).value;
    return polyContext(d, scorePoly(d.market, settings));
  }
  const symbol = body.id.toUpperCase();
  if (!/^[A-Z0-9.^=\-]{1,15}$/.test(symbol)) throw new Error("código inválido");
  const settings = mergeSettings<BolsaSettings>(DEFAULT_BOLSA_SETTINGS, body.settings);
  const d = (await getAssetDetail(symbol, "6m")).value;
  return bolsaContext(d.asset, d.candles, scoreBolsa(d.asset, settings));
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Falta a chave da API do Claude. Crie uma em console.anthropic.com, coloque ANTHROPIC_API_KEY=sua-chave no arquivo .env.local da pasta do projeto e reinicie o npm run dev.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
    if (body.area !== "bolsa" && body.area !== "polymarket") throw new Error();
    if (typeof body.id !== "string") throw new Error();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  let context: string;
  try {
    context = await buildContext(body);
  } catch (err) {
    return NextResponse.json({ error: `Não consegui carregar os dados: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const msg = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 4000,
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: context }],
          },
          { signal: req.signal },
        );
        for await (const event of msg) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") send(event.delta.text);
        }
        const final = await msg.finalMessage();
        if (final.stop_reason === "refusal") {
          send("\n\n[[ERRO]]A análise foi recusada pelo modelo. Tente de novo mais tarde.");
        } else if (final.stop_reason === "max_tokens") {
          send("\n\n_(resposta cortada por tamanho)_");
        }
      } catch (err) {
        let message = "Falha ao gerar a análise.";
        if (err instanceof Anthropic.AuthenticationError) message = "Chave da API do Claude inválida. Confira ANTHROPIC_API_KEY no .env.local.";
        else if (err instanceof Anthropic.RateLimitError) message = "Limite de uso da API atingido. Espere um pouco e tente de novo.";
        else if (err instanceof Anthropic.APIError) message = `Erro da API do Claude (${err.status ?? "rede"}): ${err.message}`;
        else if (err instanceof Error && err.name === "AbortError") message = "Cancelado.";
        send(`\n\n[[ERRO]]${message}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
