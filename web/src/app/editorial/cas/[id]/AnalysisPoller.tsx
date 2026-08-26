"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Suivi d'analyse par polling : interroge le statut tant que la génération
 * n'est pas terminale, puis rafraîchit la page serveur. Aucune progression
 * chiffrée n'est inventée ; seul l'état réel est affiché.
 */
export function AnalysisPoller({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let polls = 0;
    const interval = window.setInterval(async () => {
      polls += 1;
      if (polls > 80) {
        window.clearInterval(interval);
        return;
      }
      try {
        const response = await fetch(`/api/cas/${intakeId}/statut`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { generationStatus: string | null };
        if (data.generationStatus === "terminal" && !stopped.current) {
          stopped.current = true;
          window.clearInterval(interval);
          router.refresh();
        }
      } catch {
        /* réseau local uniquement : on retentera au tick suivant */
      }
    }, 1200);
    return () => {
      stopped.current = true;
      window.clearInterval(interval);
    };
  }, [intakeId, router]);

  return null;
}
