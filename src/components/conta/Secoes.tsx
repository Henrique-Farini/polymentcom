"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import type { IconName } from "@/components/Icons";
import { PerfilQuiz } from "@/components/PerfilQuiz";
import { Card } from "@/components/ui";
import { DEFAULT_CONTA, PERFIL_META, readUso, useConta, type Conta, type Uso } from "@/lib/client/conta";
import { useStored } from "@/lib/client/hooks";
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from "@/lib/client/transitions";
import { GLOSSARIO } from "@/lib/glossario";
import { DAYS_LABEL, SIM_DAYS, SIM_STOPS } from "@/lib/simulador";

export const SECOES: { slug: string; label: string; icon: IconName; desc: string }[] = [
  { slug: "perfil", label: "Perfil", icon: "user", desc: "Seu nome e perfil de risco" },
  { slug: "investimento", label: "Investimento e risco", icon: "sliders", desc: "Valor, prazo, stop e limites" },
  { slug: "conexoes", label: "Conexões e chaves", icon: "key", desc: "Claude, corretora e Polymarket" },
  { slug: "idioma", label: "Idioma e região", icon: "globe", desc: "Idioma, fuso e formatos" },
  { slug: "notificacoes", label: "Notificações", icon: "bell", desc: "Avisos no navegador" },
  { slug: "uso", label: "Uso e dados", icon: "gauge", desc: "O que está salvo neste navegador" },
  { slug: "ajuda", label: "Receber ajuda", icon: "help", desc: "Perguntas frequentes e glossário" },
  { slug: "sobre", label: "Saiba mais", icon: "info", desc: "Fontes, limites e avisos" },
];

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const input = "w-full rounded-lg border border-line bg-card2 px-3 py-2 text-sm outline-none focus:border-info";

function Saved({ show }: { show: boolean }) {
  return <span className={`text-xs text-up transition-opacity ${show ? "opacity-100" : "opacity-0"}`}>✓ salvo</span>;
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), 1500);
    return () => clearTimeout(t);
  }, [on]);
  return [on, () => setOn(true)];
}

/* ---------------------------------- Perfil ---------------------------------- */

export function PerfilSecao() {
  const [conta, setConta] = useConta();
  const [quiz, setQuiz] = useState(false);
  const [saved, flash] = useFlash();
  const p = conta.perfil ? PERFIL_META[conta.perfil] : null;
  return (
    <div className="space-y-4">
      <Title sub="Usamos isso para escolher o que mostrar na aba Para iniciantes.">Perfil</Title>
      <Card className="p-4">
        <Field label="Como quer ser chamado?">
          <div className="flex items-center gap-3">
            <input
              className={input}
              value={conta.nome}
              maxLength={40}
              placeholder="Seu nome"
              onChange={(e) => {
                setConta({ ...conta, nome: e.target.value });
                flash();
              }}
            />
            <Saved show={saved} />
          </div>
        </Field>
      </Card>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Perfil de risco</div>
            {p ? (
              <p className="mt-1 text-sm text-muted">
                <b className={p.color}>{p.label}</b>. {p.desc}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Ainda não definido. Responda 3 perguntas rápidas.</p>
            )}
          </div>
          {!quiz && (
            <button type="button" onClick={() => setQuiz(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-info">
              {p ? "Refazer perguntas" : "Descobrir meu perfil"}
            </button>
          )}
        </div>
        {quiz && (
          <div className="mt-4 border-t border-line pt-4">
            <PerfilQuiz
              onDone={(perfil) => {
                setConta({ ...conta, perfil });
                setQuiz(false);
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------ Investimento ------------------------------ */

export function InvestimentoSecao() {
  const [conta, setConta] = useConta();
  const [saved, flash] = useFlash();
  const set = (patch: Partial<Conta>) => {
    setConta({ ...conta, ...patch });
    flash();
  };
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);
  return (
    <div className="space-y-4">
      <Title sub="Valores padrão do simulador e as travas de segurança para quando a automação for ligada.">
        Investimento e risco <Saved show={saved} />
      </Title>
      <Card className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Valor por operação (R$)" hint="Quanto você pensa em colocar.">
          <input className={`${input} num`} inputMode="decimal" value={conta.valor} onChange={(e) => set({ valor: num(e.target.value) })} />
        </Field>
        <Field label="Quanto tempo fica investido" hint="Dias de pregão (sem fim de semana).">
          <select className={input} value={conta.dias} onChange={(e) => set({ dias: Number(e.target.value) })}>
            {SIM_DAYS.map((d) => (
              <option key={d} value={d}>{DAYS_LABEL[d]} ({d} pregões)</option>
            ))}
          </select>
        </Field>
        <Field label="Sair se cair (stop loss)" hint="Vende se cair esta porcentagem.">
          <select className={input} value={conta.stop} onChange={(e) => set({ stop: Number(e.target.value) })}>
            {SIM_STOPS.map((s) => (
              <option key={s ?? 0} value={s ?? 0}>{s === null ? "Sem stop" : `${Math.round(s * 100)}%`}</option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Travas de segurança</h2>
        <p className="mt-1 text-xs text-muted">Valem para a automação de ordens. Se passar de qualquer limite, o robô para e avisa você.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Valor máximo por operação (R$)">
            <input className={`${input} num`} inputMode="decimal" value={conta.maxPorOperacao} onChange={(e) => set({ maxPorOperacao: num(e.target.value) })} />
          </Field>
          <Field label="Perda máxima por dia (R$)" hint="Somando todas as operações do dia.">
            <input className={`${input} num`} inputMode="decimal" value={conta.perdaMaxDia} onChange={(e) => set({ perdaMaxDia: num(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card className="border-warn/40 p-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted" />
          <h2 className="text-sm font-semibold">Automação de ordens: desligada</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Ainda não há nenhuma conexão com corretora. O plano, em etapas, para não arriscar dinheiro com um erro de programação:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-text">Conta demo do MetaTrader 5</b>: preços reais, dinheiro de mentira. O robô compra, segura os dias e sai no stop.</li>
          <li><b className="text-text">Valores pequenos</b> numa conta real, com as travas acima.</li>
          <li><b className="text-text">Aumentar</b> só depois de semanas funcionando como esperado.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">Escolha a corretora em <Link href="/conta/conexoes" className="text-info hover:underline">Conexões e chaves</Link>.</p>
      </Card>
    </div>
  );
}

/* -------------------------------- Conexões -------------------------------- */

function ClaudeKeyCard() {
  const [st, setSt] = useState<{ configured: boolean; masked: string | null } | null>(null);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/conta/chave")
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setSt(null));
  }, []);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/conta/chave", {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ key }) : undefined,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
      setSt(j);
      setKey("");
      setMsg({ ok: true, text: method === "POST" ? "Chave salva. O Explicar com IA já funciona." : "Chave removida." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Claude (Explicar com IA)</h2>
        <StatusChip on={!!st?.configured} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Usada pelo botão “Explicar” nas páginas de ativo e mercado. Fica salva só neste computador, no arquivo .env.local do projeto. Cada explicação custa poucos centavos de dólar.
      </p>
      {st?.configured && <p className="num mt-2 text-xs">Chave atual: {st.masked}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          className={`${input} num min-w-0 flex-1`}
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button type="button" disabled={busy || !key} onClick={() => send("POST")} className="rounded-lg bg-info px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
          Salvar
        </button>
        {st?.configured && (
          <button type="button" disabled={busy} onClick={() => send("DELETE")} className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-down">
            Remover
          </button>
        )}
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-info hover:underline">
        Criar uma chave no console da Anthropic ↗
      </a>
    </Card>
  );
}

function StatusChip({ on, offLabel = "Não conectado" }: { on: boolean; offLabel?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-up/10 text-up ring-up/30" : "bg-card2 text-muted ring-line"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-up" : "bg-muted"}`} />
      {on ? "Conectado" : offLabel}
    </span>
  );
}

const CORRETORAS = ["XP", "Clear", "Rico", "BTG Pactual", "Genial", "Modal", "Inter", "Nubank", "Outra"];

export function ConexoesSecao() {
  const [conta, setConta] = useConta();
  return (
    <div className="space-y-4">
      <Title sub="Onde ficam as chaves e contas que o app usa. Senhas e chaves nunca saem deste computador.">Conexões e chaves</Title>
      <ClaudeKeyCard />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Corretora (Bolsa)</h2>
          <StatusChip on={false} />
        </div>
        <p className="mt-1 text-xs text-muted">
          Para o app comprar e vender sozinho na B3, a ligação mais viável é o MetaTrader 5, que várias corretoras liberam e que roda no Windows.
          Confira na sua corretora se ela oferece MT5 para ações.
        </p>
        <div className="mt-3 max-w-xs">
          <Field label="Sua corretora">
            <select className={input} value={conta.corretora} onChange={(e) => setConta({ ...conta, corretora: e.target.value })}>
              <option value="">Escolha…</option>
              {CORRETORAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">
          Próximo passo: abrir uma <b className="text-text">conta demo</b> do MetaTrader 5 na corretora. O login do MT5 você mesmo digita no programa; o app nunca pede sua senha.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Carteira do Polymarket</h2>
          <StatusChip on={false} />
        </div>
        <p className="mt-1 text-xs text-muted">
          Hoje o app só lê dados públicos do Polymarket. Para apostar sozinho ele precisaria da chave privada da sua carteira, e quem tiver essa chave leva todo o saldo.
          Por isso ela não é pedida nesta tela: quando a automação chegar, fica num arquivo local com uma carteira separada, só com o valor que você aceita arriscar.
        </p>
      </Card>
    </div>
  );
}

/* --------------------------------- Idioma --------------------------------- */

const IDIOMAS: { v: Conta["idioma"]; label: string; ready: boolean }[] = [
  { v: "pt-BR", label: "Português (Brasil)", ready: true },
  { v: "en", label: "English", ready: false },
  { v: "es", label: "Español", ready: false },
];

export function IdiomaSecao() {
  const [conta, setConta] = useConta();
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return (
    <div className="space-y-4">
      <Title>Idioma e região</Title>
      <Card className="p-4">
        <div className="text-sm font-medium">Idioma</div>
        <div className="mt-2 space-y-1.5">
          {IDIOMAS.map((i) => (
            <label key={i.v} className={`flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm ${i.ready ? "cursor-pointer hover:border-muted" : "opacity-50"}`}>
              <input type="radio" name="idioma" disabled={!i.ready} checked={conta.idioma === i.v} onChange={() => setConta({ ...conta, idioma: i.v })} />
              {i.label}
              {!i.ready && <span className="ml-auto text-[11px] text-muted">em breve</span>}
            </label>
          ))}
        </div>
      </Card>
      <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">Fuso horário</div>
          <div className="mt-0.5">{tz || "–"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Números</div>
          <div className="num mt-0.5">{(1234.56).toLocaleString("pt-BR")}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Pregão da B3</div>
          <div className="mt-0.5">10h às 17h (Brasília)</div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Notificações ------------------------------ */

export function NotificacoesSecao() {
  const [bolsa, setBolsa] = useStored<AlertPrefs>("radar:bolsa:alerts", DEFAULT_ALERT_PREFS, true);
  const [poly, setPoly] = useStored<AlertPrefs>("radar:polymarket:alerts", DEFAULT_ALERT_PREFS, true);
  return (
    <div className="space-y-4">
      <Title sub="Avisos quando um ativo ou mercado muda de situação (entra em destaque ou em alerta).">Notificações</Title>
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-up">Bolsa</h2>
        <AlertSettings prefs={bolsa} setPrefs={setBolsa} />
      </div>
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-poly">Polymarket</h2>
        <AlertSettings prefs={poly} setPrefs={setPoly} />
      </div>
    </div>
  );
}

/* ---------------------------------- Uso ---------------------------------- */

export function UsoSecao() {
  const [uso, setUso] = useState<Uso | null>(null);
  const [info, setInfo] = useState<{ keys: number; bytes: number; favB: number; favP: number } | null>(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    setUso(readUso());
    let bytes = 0;
    let keys = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith("radar:")) continue;
      keys++;
      bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    const len = (k: string) => {
      try {
        return (JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[]).length;
      } catch {
        return 0;
      }
    };
    setInfo({ keys, bytes, favB: len("radar:bolsa:watchlist"), favP: len("radar:polymarket:watchlist") });
  };
  useEffect(load, []);

  function exportar() {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("radar:")) data[k] = JSON.parse(localStorage.getItem(k)!);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importar(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      let n = 0;
      for (const [k, v] of Object.entries(data)) {
        if (!k.startsWith("radar:")) continue;
        localStorage.setItem(k, JSON.stringify(v));
        n++;
      }
      setMsg(`${n} itens restaurados. Recarregando…`);
      setTimeout(() => location.reload(), 800);
    } catch {
      setMsg("Arquivo inválido.");
    }
  }

  function apagar() {
    if (!confirm("Apagar perfil, favoritos, configurações e histórico deste navegador? Não dá para desfazer (a não ser com um backup).")) return;
    const ks: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("radar:")) ks.push(k);
    }
    ks.forEach((k) => localStorage.removeItem(k));
    setMsg("Dados apagados. Recarregando…");
    setTimeout(() => location.reload(), 800);
  }

  const desde = uso ? new Date(uso.desde).toLocaleDateString("pt-BR") : "";
  return (
    <div className="space-y-4">
      <Title sub="Tudo fica salvo só neste navegador. Nada é enviado para servidor nenhum.">Uso e dados</Title>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Explicações com IA", v: uso?.ia ?? 0, sub: `desde ${desde}` },
          { label: "Simulações", v: uso?.simulacoes ?? 0, sub: `desde ${desde}` },
          { label: "Favoritos na Bolsa", v: info?.favB ?? 0 },
          { label: "Favoritos no Polymarket", v: info?.favP ?? 0 },
        ].map((x) => (
          <Card key={x.label} className="p-4">
            <div className="text-xs text-muted">{x.label}</div>
            <div className="num mt-1 text-2xl font-semibold">{x.v}</div>
            {x.sub && <div className="text-[11px] text-muted">{x.sub}</div>}
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium">Dados salvos</div>
        <p className="mt-1 text-xs text-muted">
          {info ? `${info.keys} itens, ${(info.bytes / 1024).toFixed(1)} KB` : "…"} (perfil, configurações, favoritos, histórico de sinais).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={exportar} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-info">Baixar backup</button>
          <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm hover:border-info">
            Restaurar backup
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
          </label>
          <button type="button" onClick={apagar} className="rounded-lg border border-down/40 px-3 py-1.5 text-sm text-down hover:bg-down/10">Apagar tudo</button>
        </div>
        {msg && <p className="mt-2 text-xs text-warn">{msg}</p>}
      </Card>
      <button type="button" onClick={() => { setUso({ ...(uso ?? readUso()), ia: 0, simulacoes: 0, desde: Date.now() }); localStorage.setItem("radar:uso", JSON.stringify({ ia: 0, simulacoes: 0, desde: Date.now() })); }} className="text-xs text-muted hover:text-text">
        Zerar contadores
      </button>
    </div>
  );
}

/* --------------------------------- Ajuda --------------------------------- */

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Por onde eu começo?",
    a: (
      <>
        Abra <Link href="/comecar" className="text-info hover:underline">Para iniciantes</Link>, responda as 3 perguntas do perfil e veja os ativos mais fortes para você. Depois use o simulador para ver o que teria
        acontecido no passado com o prazo e o stop que você escolher.
      </>
    ),
  },
  {
    q: "O app compra e vende por mim?",
    a: "Ainda não. Hoje ele analisa, simula e avisa. Para comprar e vender, use o app da sua corretora (Bolsa) ou o site do Polymarket. A automação está planejada com conta demo primeiro (veja Investimento e risco).",
  },
  {
    q: "O que significa o score?",
    a: "Uma nota de 0 a 100 que resume os sinais de agora: tendência, força, volume e risco. Acima de 65 entra “Em destaque”; quedas fortes ou sinais ruins vão para “Em alerta”. Nas configurações de cada área dá para mudar os pesos.",
  },
  {
    q: "Os sinais acertam?",
    a: "A página Análise de mercado testa isso com 5 anos de dados. Até agora, seguir só a tendência não rendeu mais que a média. Use os sinais como ponto de partida, não como garantia.",
  },
  {
    q: "Por que a cotação da B3 é diferente do meu home broker?",
    a: "A fonte gratuita (Yahoo Finance) tem atraso de até 15 minutos para a B3. Ações dos EUA, cripto e Polymarket são quase em tempo real.",
  },
  {
    q: "Quanto custa?",
    a: "O app e os dados são gratuitos. Só o “Explicar com IA” usa a API do Claude, que cobra alguns centavos de dólar por explicação.",
  },
  {
    q: "Meus dados ficam onde?",
    a: "No seu computador: preferências no navegador, chave do Claude no arquivo .env.local. Nada vai para servidores do app.",
  },
];

const ATALHOS = [
  ["↑ ↓", "Trocar de ativo/mercado na tabela do Terminal"],
  ["Passar o mouse", "Destaca um item do gráfico e escurece os outros"],
  ["Clique no título da coluna", "Ordena a tabela"],
  ["★", "Adiciona aos favoritos"],
];

export function AjudaSecao() {
  const [q, setQ] = useState("");
  const termos = Object.values(GLOSSARIO).filter((g) => !q || (g.termo + g.def).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <Title sub="Respostas rápidas e o significado das palavras do mercado.">Receber ajuda</Title>
      <Card className="divide-y divide-line">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              {f.q}
              <span className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-2 text-sm text-muted">{f.a}</div>
          </details>
        ))}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Glossário</h2>
          <input className={`${input} max-w-56`} placeholder="Buscar termo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {termos.map((g) => (
            <div key={g.termo}>
              <dt className="text-sm font-medium text-info">{g.termo}</dt>
              <dd className="text-xs text-muted">{g.def}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Atalhos</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {ATALHOS.map(([k, v]) => (
            <li key={k} className="flex gap-3">
              <kbd className="num min-w-28 rounded border border-line bg-card2 px-1.5 text-center text-xs">{k}</kbd>
              <span className="text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* --------------------------------- Sobre --------------------------------- */

export function SobreSecao() {
  return (
    <div className="space-y-4">
      <Title>Saiba mais</Title>
      <Card className="p-4 text-sm">
        <h2 className="font-semibold">De onde vêm os dados</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Bolsa: Yahoo Finance (gratuito). B3 com atraso de até 15 minutos.</li>
          <li>Polymarket: APIs públicas Gamma e CLOB, quase em tempo real.</li>
          <li>Estatísticas: 5 anos de preços diários; Polymarket, 600 mercados resolvidos.</li>
        </ul>
      </Card>
      <Card className="p-4 text-sm">
        <h2 className="font-semibold">O que o app não faz</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Não garante resultado: estatística do passado não se repete com certeza.</li>
          <li>Não desconta taxas, impostos (IR de 15% a 20% sobre o lucro em ações), spread nem variação do dólar.</li>
          <li>Não é recomendação de investimento nem substitui um profissional certificado.</li>
          <li>Polymarket é aposta: dá para perder tudo que foi colocado em um mercado.</li>
        </ul>
      </Card>
      <Card className="p-4 text-sm text-muted">
        Radar de Mercado · versão 0.2 · roda no seu computador (localhost). Configurações padrão: {DEFAULT_CONTA.valor.toLocaleString("pt-BR")} reais, {DAYS_LABEL[DEFAULT_CONTA.dias]}, stop de{" "}
        {Math.round(DEFAULT_CONTA.stop * 100)}%.
      </Card>
    </div>
  );
}
