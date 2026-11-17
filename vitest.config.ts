import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Tests never read the project's .env files or use the CloudBase Vite proxy.
  envDir: false,
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/unit/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    maxWorkers: 2,
  },
});
