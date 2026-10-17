"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register after page has fully loaded to ensure fast initial page load & CWV
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((error) => {
            console.error("Service worker registration failed:", error);
          });
      });
    }
  }, []);

  return null;
}
