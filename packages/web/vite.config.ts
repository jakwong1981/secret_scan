import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerOptions } from "node:https";

const root = resolve(import.meta.dirname, "../..");
const certPath = resolve(root, process.env.SKP_TLS_CERT_PATH ?? "./certs/localhost.pem");
const keyPath = resolve(root, process.env.SKP_TLS_KEY_PATH ?? "./certs/localhost-key.pem");

/** The dev server is HTTPS too, mirroring the production deployment. */
function devHttps(): ServerOptions | undefined {
  if (!existsSync(certPath) || !existsSync(keyPath)) return undefined;
  try {
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  } catch {
    return undefined;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    host: "127.0.0.1",
    https: devHttps(),
    proxy: {
      "/api": {
        target: process.env.VITE_API_ORIGIN ?? "https://127.0.0.1:4173",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
