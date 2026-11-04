import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/etf-table-app/",
  plugins: [react()],
});
