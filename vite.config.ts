import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localAppsPlugin } from "./server/localApps";
import { coreManuscriptsPlugin } from "./server/coreManuscripts";
import path from "node:path";

// Module boundaries mirror Master Spec §55. UI depends on engines;
// engines never import from ui/. Enforce this socially for now,
// consider an eslint import-boundary rule once the surface stabilizes.
export default defineConfig({
  plugins: [react(), localAppsPlugin(), coreManuscriptsPlugin()],
  resolve: {
    alias: {
      "@session": path.resolve(__dirname, "src/session"),
      "@state": path.resolve(__dirname, "src/state"),
      "@context": path.resolve(__dirname, "src/context"),
      "@memory": path.resolve(__dirname, "src/memory"),
      "@layers": path.resolve(__dirname, "src/layers"),
      "@llm": path.resolve(__dirname, "src/llm"),
      "@events": path.resolve(__dirname, "src/events"),
      "@persistence": path.resolve(__dirname, "src/persistence"),
      "@library": path.resolve(__dirname, "src/library"),
      "@crypto": path.resolve(__dirname, "src/crypto"),
      "@diagnostics": path.resolve(__dirname, "src/diagnostics"),
      "@ui": path.resolve(__dirname, "src/ui")
    }
  },
  test: {
    environment: "node",
    globals: true
  }
});

