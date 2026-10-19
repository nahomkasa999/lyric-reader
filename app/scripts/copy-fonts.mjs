// Copies the self-hosted font files from npm packages into public/fonts,
// so the repo never needs to carry binary font files. Runs as `prebuild`
// (see package.json) before every `vite build`, locally and on Vercel.
// The target filenames are the ones src/index.css @font-face rules expect.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(appRoot, "public", "fonts");
mkdirSync(out, { recursive: true });

const geistSans = join(appRoot, "node_modules", "geist", "dist", "fonts", "geist-sans");
const geistMono = join(appRoot, "node_modules", "geist", "dist", "fonts", "geist-mono");
const noto = join(appRoot, "node_modules", "@fontsource", "noto-serif-georgian", "files");
const lexend = join(appRoot, "node_modules", "@fontsource", "lexend", "files");

const copies = [
  [join(geistSans, "Geist-Regular.woff2"), "Geist-Regular.woff2"],
  [join(geistSans, "Geist-SemiBold.woff2"), "Geist-SemiBold.woff2"],
  [join(geistMono, "GeistMono-Regular.woff2"), "GeistMono-Regular.woff2"],
  [
    join(noto, "noto-serif-georgian-latin-600-normal.woff2"),
    "NotoSerifGeorgian-SemiBold-latin.woff2",
  ],
  [
    join(noto, "noto-serif-georgian-latin-ext-600-normal.woff2"),
    "NotoSerifGeorgian-SemiBold-latinext.woff2",
  ],
  [join(lexend, "lexend-latin-400-normal.woff2"), "Lexend-Regular.woff2"],
  [join(lexend, "lexend-latin-600-normal.woff2"), "Lexend-SemiBold.woff2"],
];

for (const [src, name] of copies) {
  copyFileSync(src, join(out, name));
  console.log("font:", name);
}
