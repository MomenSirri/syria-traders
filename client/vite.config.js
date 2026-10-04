import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const keyPath = path.resolve(__dirname, "../certs/dev-key.pem");
const certPath = path.resolve(__dirname, "../certs/dev-cert.pem");

const https =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : true;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "https://localhost:8443", secure: false } },
    https,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
