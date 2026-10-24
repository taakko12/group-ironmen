import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Same alias the vendored tree compiles against.
      "@": path.resolve(import.meta.dirname, "vendor"),
      // Upstream's suite is written for jest; the handful of globals it pulls
      // (describe/test/expect) are API-compatible with vitest's.
      "@jest/globals": "vitest",
    },
  },
  // Ours plus upstream's own suite, which is the oracle for whether the
  // vendored copy still computes what they compute. .calc-checkout is their
  // raw working tree and is deliberately not included.
  test: { include: ["test/**/*.test.ts", "vendor/tests/**/*.test.ts"] },
});
