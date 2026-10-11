import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI relativa (base ./): l'app serveix la UI a l'arrel i la plataforma la
// publica sota <feature>/ (l'API sota <feature>/api). Assets i fetch relatius
// perquè sobrevisquin al path-stripping de l'ingress.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/health": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
