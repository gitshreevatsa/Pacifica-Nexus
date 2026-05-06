import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/trading-math.ts",
        "src/lib/keyVault.ts",
        "src/lib/featureFlags.ts",
        "src/stores/orderLifecycleStore.ts",
        "src/stores/killSwitchStore.ts",
        "src/stores/tradeLogStore.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
