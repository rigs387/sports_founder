import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Behavioural tests play whole campaigns across all 213 real markets; a few take tens of
    // seconds when the workers are competing for the machine.
    testTimeout: 120_000,
  },
});
