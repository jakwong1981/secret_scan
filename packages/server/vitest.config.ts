import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    reporters: ["default"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
