"use client";

import { useState } from "react";
import { PERFIL_META, type Perfil } from "@/lib/client/conta";

const PERGUNTAS = [
  {
    q: "Se o seu dinheiro caísse 20% em um mês, o que você faria?",
    a: ["Vendia tudo para não perder mais", "Esperava recuperar", "Aproveitava para comprar mais"],
  },
  {
    q: "Por quanto tempo você pode deixar esse dinheiro investido sem precisar dele?",
    a: ["Menos de 6 meses", "De 6 meses a 2 anos", "Mais de 2 anos"],
  },
  {
    q: "O que é mais importante para você?",
    a: ["Não perder dinheiro", "Um equilíbrio entre segurança e ganho", "Ganhar o máximo, mesmo arriscando"],
  },
];

export function perfilFromPoints(points: number): Perfil {
  if (points <= 1) return "conservador";
  if (points <= 4) return "moderado";
  return "arrojado";
}

/** Três perguntas para descobrir o perfil de risco. */
export function PerfilQuiz({ onDone }: { onDone: (p: Perfil) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(PERGUNTAS.map(() => null));
  const done = answers.every((a) => a !== null);
  const result = done ? perfilFromPoints(answers.reduce<number>((s, a) => s + (a ?? 0), 0)) : null;

  return (
    <div className="space-y-4">
      {PERGUNTAS.map((p, i) => (
        <fieldset key={p.q}>
          <legend className="mb-2 text-sm font-medium">
            <span className="mr-2 text-muted">{i + 1}.</span>
            {p.q}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {p.a.map((label, j) => {
              const on = answers[i] === j;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAnswers((xs) => xs.map((x, k) => (k === i ? j : x)))}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    on ? "border-info bg-info/10 text-text" : "border-line bg-card2 text-muted hover:border-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm text-muted">
          {result ? (
            <>
              Seu perfil: <b className={PERFIL_META[result].color}>{PERFIL_META[result].label}</b>. {PERFIL_META[result].desc}
            </>
          ) : (
            "Responda as 3 perguntas."
          )}
        </p>
        <button
          type="button"
          disabled={!result}
          onClick={() => result && onDone(result)}
          className="rounded-lg bg-info px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Salvar perfil
        </button>
      </div>
    </div>
  );
}
