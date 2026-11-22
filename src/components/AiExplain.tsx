"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { bumpUso } from "@/lib/client/conta";
import { clock } from "@/lib/format";
import { Card } from "./ui";

const ERROR_MARK = "[[ERRO]]";

/** Renderiza o markdown simples que a análise usa: ## títulos, - listas e **negrito**. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-text">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-1 marker:text-muted">
          {list.map((li, i) => (
            <li key={i}>
              <Inline text={li} />
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) {
      list.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }
    flush();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      blocks.push(
        <h3 key={`h${blocks.length}`} className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {h[1]}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={`p${blocks.length}`}>
          <Inline text={line} />
        </p>,
      );
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-text/90">{blocks}</div>;
}

export function AiExplain({
  area,
  id,
  settings,
  accent = "up",
}: {
  area: "bolsa" | "polymarket";
  id: string;
  settings: unknown;
  accent?: "up" | "poly";
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [at, setAt] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  // Ao trocar de ativo/mercado, a análise anterior não vale mais.
  useEffect(() => {
    ctrl.current?.abort();
    setText("");
    setError(null);
    setState("idle");
    setAt(null);
    return () => ctrl.current?.abort();
  }, [area, id]);

  async function run() {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setText("");
    setError(null);
    setState("loading");
    bumpUso("ia");
    try {
      const res = await fetch("/api/explicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area, id, settings }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const cut = acc.indexOf(ERROR_MARK);
        if (cut >= 0) {
          setText(acc.slice(0, cut).trim());
          setError(acc.slice(cut + ERROR_MARK.length).trim());
        } else {
          setText(acc);
        }
      }
      setAt(Date.now());
      setState("done");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setState("done");
    }
  }

  const btn = accent === "poly" ? "bg-poly text-white hover:bg-poly/90" : "bg-up text-black hover:bg-up/90";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">✦ Explicar com IA</h2>
          <p className="text-xs text-muted">
            O Claude lê os dados atuais e o score e explica o cenário, os prós, os contras e o que observar.
          </p>
        </div>
        {state === "loading" ? (
          <button type="button" onClick={() => ctrl.current?.abort()} className="rounded-md bg-card2 px-3 py-1.5 text-sm text-muted hover:text-text">
            Parar
          </button>
        ) : (
          <button type="button" onClick={run} className={`rounded-md px-3 py-1.5 text-sm font-medium ${btn}`}>
            {state === "done" ? "Gerar de novo" : "Explicar"}
          </button>
        )}
      </div>

      {(text || state === "loading") && (
        <div className="mt-4 border-t border-line pt-3" aria-live="polite">
          {text ? <Markdown text={text} /> : <p className="text-sm text-muted">Analisando os dados…</p>}
          {state === "loading" && text && <span className="live-dot ml-1 inline-block h-3 w-1.5 bg-muted align-middle" />}
        </div>
      )}
      {error && <p className="mt-3 rounded-md bg-down/10 p-2 text-xs text-down">{error}</p>}
      {at && !error && (
        <p className="mt-3 text-[11px] text-muted">
          Gerado às {clock(at)} com os dados desse momento. Análise informativa, não é recomendação de investimento.
        </p>
      )}
    </Card>
  );
}
