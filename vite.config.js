import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    // Two separate pages: your main dashboard, and a standalone page for
    // your boss with its own hardcoded name/icon that iOS picks up reliably
    // when he taps "Add to Home Screen" — this is more reliable than
    // swapping the name with JavaScript after the page has already loaded.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        boss: fileURLToPath(new URL("./boss.html", import.meta.url)),
      },
    },
  },
});
