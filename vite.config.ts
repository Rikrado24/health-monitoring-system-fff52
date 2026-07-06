import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5500,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5500,
    strictPort: false,
    allowedHosts: true,
  },
});
