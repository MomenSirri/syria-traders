import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import legacyCss from "./legacyCss.js";

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
  plugins: [
    react(),
    // Smart-TV browsers run old Chromium engines (2018 LG and Samsung TVs are
    // Chrome 53-63). They load a transpiled bundle with polyfills; current
    // browsers keep the modern one and only get the polyfills they lack.
    legacy({ targets: ["chrome >= 53", "safari >= 11", "firefox >= 60"], modernPolyfills: true }),
  ],
  css: { postcss: { plugins: [legacyCss()] } },
  build: { cssTarget: "chrome53" },
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
