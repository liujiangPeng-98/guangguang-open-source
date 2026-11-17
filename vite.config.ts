import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.CLOUDBASE_AUTH_ORIGIN;
  if (target) {
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("CLOUDBASE_AUTH_ORIGIN must be an HTTPS origin without credentials, path or query");
    }
  }
  return {
    plugins: [react()],
    base: "./",
    server: {
      host: "127.0.0.1", port: 5174, strictPort: true,
      proxy: target ? { "/__auth": { target, changeOrigin: true } } : undefined,
    },
  };
});
