import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";

// Register the service worker so the app installs and works offline.
// A session opened before a deploy must pick up the new build on its own,
// so poll the SW for updates, refresh on visibility change, and reload once
// the controller switches to the new worker.
// In dev this is a no-op (no SW is generated for `vite dev`).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let reloaded = false;
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registration.update();
      setInterval(() => registration.update(), 60_000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update();
      });
    },
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !navigator.serviceWorker.controller) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
