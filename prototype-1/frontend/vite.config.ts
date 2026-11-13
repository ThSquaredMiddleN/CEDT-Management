import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: {
    target: "es2020",
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: "react-vendor", test: /\/node_modules\/(?:react|react-dom|react-router|react-router-dom|scheduler)\// },
    ] } } },
  },
  server: {
    port: 5173,
    // The backend only trusts http://localhost:5173 (CSRF origin check). Without this,
    // a second `npm run dev` silently hops to 5174 and every login fails with 403.
    strictPort: true,
    proxy: {
      // The SPA always calls relative /api/v1/... paths so cookies are same-origin in dev.
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
