import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Only needed for GitHub Pages: replace "your-repo-name" with your actual
  // GitHub repo name (must match exactly, including capitalization).
  // If you're deploying with Vercel instead, delete this "base" line.
  base: "/your-repo-name/",
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
