import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { config as loadEnvFile } from "dotenv";
import { fileURLToPath, URL } from "node:url";

// The Gemini key lives in the repo's .env.local (never in the code,
// never in git). Vite only hands VITE_-prefixed vars to the browser, so
// the key is passed across under that name here.
//
// The ElevenLabs key is NOT here: each reader brings their own and it
// stays on their phone (Settings → Read aloud).
loadEnvFile({ path: "../.env.local" });

export default defineConfig({
  // Build identifier stamped into the bundle so a screenshot of the
  // Settings page always tells which build is actually running on a
  // device (v4.6: ended the "which build is on the phone" guessing).
  resolve: {
    // The shadcn/ui path alias — "@/components/ui/button".
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(
      process.env.LR_BUILD_ID ??
        new Date().toISOString().slice(0, 16).replace("T", " "),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/*.woff2", "icons/*.png"],
      manifest: {
        name: "Lyric Reader",
        short_name: "LyricReader",
        description:
          "Read books one sentence at a time — Spotify-lyrics style reading for dense textbooks.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA fallback so reloads work offline
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        // pdf.js worker is large; still fine to precache for a local install
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // The ElevenLabs SDK is 4.6 MB and only needed once somebody uses
        // the voice — so it stays out of the install. The browser keeps it
        // after the first use.
        globIgnores: ["**/elevenlabs-js-*.js"],
      },
    }),
  ],
});
