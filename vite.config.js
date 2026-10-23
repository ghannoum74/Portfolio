import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    allowedHosts: ["moonlit-sensually-impurity.ngrok-free.dev"],
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
