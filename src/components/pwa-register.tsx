"use client";

import { useEffect } from "react";

/** Registra o service worker (somente em produção, para não interferir no hot reload). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sem service worker o site continua funcionando normalmente
    });
  }, []);
  return null;
}
