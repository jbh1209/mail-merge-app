import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Cross-Origin Isolation headers for WASM workers (CMYK conversion)
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure ICC profile files are treated as assets
  assetsInclude: ['**/*.icc'],
  // Optimize WASM handling for the CMYK conversion plugin
  optimizeDeps: {
    exclude: ['@imgly/plugin-print-ready-pdfs-web'],
  },
}));
