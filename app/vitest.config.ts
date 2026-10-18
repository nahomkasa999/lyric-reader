import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // In tests, swap the browser worker wiring for the Node legacy build.
      {
        find: /^\.\/pdfWorker$/,
        replacement: path.resolve(__dirname, "tests/pdfWorkerNode.ts"),
      },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
