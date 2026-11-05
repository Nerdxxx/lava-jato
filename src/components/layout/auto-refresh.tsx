"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Sincronização por polling: a cada `seconds` re-renderiza os dados do servidor (sem recarregar a página)
 * e também quando a aba volta a ficar visível. Mecanismo simples e confiável; pode evoluir para SSE.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
