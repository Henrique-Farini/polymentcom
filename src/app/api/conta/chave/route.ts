import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salva a chave da API do Claude no .env.local deste computador.
 * Só aceita pedidos feitos no próprio computador (localhost) e vindos da própria página,
 * para que nenhum outro site consiga trocar a chave.
 */

const ENV_FILE = path.join(process.cwd(), ".env.local");
const VAR = "ANTHROPIC_API_KEY";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(h: string | null) {
  if (!h) return null;
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

function isLocalRequest(req: Request) {
  const host = req.headers.get("host");
  if (!LOCAL_HOSTS.has(hostname(host) ?? "")) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const mask = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;

function status() {
  const k = process.env[VAR];
  return { configured: !!k, masked: k ? mask(k) : null };
}

async function writeVar(value: string | null) {
  let text = "";
  try {
    text = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    /* arquivo ainda não existe */
  }
  const lines = text.split(/\r?\n/).filter((l) => !l.startsWith(`${VAR}=`));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (value) lines.push(`${VAR}=${value}`);
  await fs.writeFile(ENV_FILE, lines.length ? lines.join("\n") + "\n" : "", "utf8");
  if (value) process.env[VAR] = value;
  else delete process.env[VAR];
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Disponível só no próprio computador" }, { status: 403 });
  return NextResponse.json(status());
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Disponível só no próprio computador" }, { status: 403 });
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 415 });
  }
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    return NextResponse.json({ error: "Isso não parece uma chave do Claude. Ela começa com sk-ant-" }, { status: 400 });
  }
  await writeVar(key);
  return NextResponse.json(status());
}

export async function DELETE(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Disponível só no próprio computador" }, { status: 403 });
  await writeVar(null);
  return NextResponse.json(status());
}
