import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// Relative base so the static build works from any path (e.g. GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // The app shell is one bundle by design (every game opens instantly offline); vendor code is split out below.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        // Vendor code changes far less often than the app, so it gets its own long-lived, parallel-loaded files.
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 20 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 15 },
            { name: "vendor", test: /node_modules[\\/]/, priority: 5 },
          ],
        },
      },
    },
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
