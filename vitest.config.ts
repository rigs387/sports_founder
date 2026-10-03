import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Tests must stay short enough to watch: the whole suite runs in about half a minute. A test
    // that needs more than this is too big; play fewer turns, anchors or seeds (sweepAnchors at most).
    testTimeout: 30_000,
    // Report any test over 5 s so slow tests are noticed before they pile up.
    slowTestThreshold: 5_000,
  },
});
