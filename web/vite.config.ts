import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Output goes where the Go binary embeds it from.
  build: { outDir: "../server/dist", emptyOutDir: true },
  // `bun run dev` talks to a Go server running on the default port.
  server: { proxy: { "/ws": { target: "ws://localhost:8080", ws: true } } },
});
