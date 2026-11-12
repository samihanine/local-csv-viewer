import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Blocks every network request from the built page: data can never leave the computer.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const contentSecurityPolicy = (mode: string): Plugin => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      // The multi-file build loads its own script and stylesheet, the single-file build inlines everything.
      `$&\n    <meta http-equiv="Content-Security-Policy" content="${mode === "html" ? CSP : CSP.replace("script-src", "script-src 'self'").replace("style-src", "style-src 'self'").replace("font-src", "font-src 'self'")}" />`,
    ),
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(mode), mode === "html" && viteSingleFile()],
  resolve: { alias: { "@": resolve("src") } },
  build: { outDir: mode === "html" ? "dist-html" : "dist", chunkSizeWarningLimit: 5_000 },
}));
