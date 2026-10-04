import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import legacyCss from "./legacyCss.js";

const keyPath = path.resolve(__dirname, "../certs/dev-key.pem");
const certPath = path.resolve(__dirname, "../certs/dev-cert.pem");

// Same switches as the server: HTTPS=0 for a TLS-terminating cloud preview proxy.
const useHttps = !["0", "false", "off"].includes(String(process.env.HTTPS).toLowerCase());
const https = !useHttps
  ? false
  : fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : true;
const apiTarget = `${useHttps ? "https" : "http"}://localhost:${process.env.PORT || 8443}`;

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
    host: process.env.DEV_HOST || "0.0.0.0",
    port: Number(process.env.DEV_PORT || 5173),
    strictPort: true,
    // Comma-separated preview hostnames, e.g. a cloud workspace's forwarded domain.
    allowedHosts: process.env.DEV_ALLOWED_HOSTS?.split(",").filter(Boolean),
    proxy: { "/api": { target: apiTarget, secure: false } },
    https,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
