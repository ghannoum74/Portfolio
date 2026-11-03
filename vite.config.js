import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    allowedHosts: ["terminal.local"],
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
