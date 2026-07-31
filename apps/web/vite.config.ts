import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
  ],
  server: {
    host: true,
    strictPort: false,
  },
  // Pre-bundle the PDF/QR libs at startup. They are only reached through a
  // dynamic import (the export button), so Vite would otherwise discover them
  // mid-session, re-optimize, and serve the already-open page a stale
  // "504 Outdated Optimize Dep" — which made PDF export fail until a refresh.
  optimizeDeps: {
    include: ["jspdf", "jspdf-autotable", "qrcode"],
  },
});
