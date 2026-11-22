"use client";

import { useEffect, useState } from "react";
import type { AlertPrefs } from "@/lib/client/transitions";
import { Card } from "./ui";

export function AlertSettings({ prefs, setPrefs }: { prefs: AlertPrefs; setPrefs: (p: AlertPrefs) => void }) {
  const [permission, setPermission] = useState<NotificationPermission | "indisponível">("default");
  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "indisponível" : Notification.permission);
  }, []);

  async function toggle(on: boolean) {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") return;
    }
    setPrefs({ ...prefs, notify: on });
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Avisos no navegador</h2>
      <p className="mt-1 text-xs text-muted">
        Avisa quando algo entra em <span className="text-down">Em alerta</span> ou em{" "}
        <span className="text-up">Em destaque</span> com score alto. Funciona com esta página aberta (pode ficar em outra aba).
      </p>
      <div className="mt-3 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.notify} onChange={(e) => toggle(e.target.checked)} />
          Ativar avisos
        </label>
        {permission === "denied" && (
          <p className="text-xs text-warn">O navegador bloqueou avisos deste site. Libere nas permissões do site (ícone de cadeado).</p>
        )}
        {permission === "indisponível" && <p className="text-xs text-warn">Este navegador não suporta avisos.</p>}
        <label className="block">
          <span className="flex justify-between text-xs text-muted">
            Score mínimo para avisar destaque <span className="num text-text">{prefs.minScore}</span>
          </span>
          <input
            type="range"
            min={50}
            max={95}
            value={prefs.minScore}
            onChange={(e) => setPrefs({ ...prefs, minScore: Number(e.target.value) })}
            className="w-full"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.onlyWatchlist} onChange={(e) => setPrefs({ ...prefs, onlyWatchlist: e.target.checked })} />
          Só para meus favoritos ★
        </label>
      </div>
    </Card>
  );
}
