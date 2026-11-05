import { execFileSync } from "node:child_process";
import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localAppsPlugin } from "./server/localApps";
import { coreManuscriptsPlugin } from "./server/coreManuscripts";
import path from "node:path";

// Module boundaries mirror Master Spec §55. UI depends on engines;
// engines never import from ui/. Enforce this socially for now,
// consider an eslint import-boundary rule once the surface stabilizes.
let exploreRevision='';try{exploreRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
export default defineConfig({
  define: { 'import.meta.env.VITE_EXPLORE_REVISION': JSON.stringify(exploreRevision) },
  plugins: [react(), localAppsPlugin(), coreManuscriptsPlugin()],
  server: {
    watch: {
      // Windows can briefly lock copied assets and crash native file watchers.
      usePolling: true,
      interval: 500,
      ignored: ["**/src-tauri/**", "**/temp/**"]
    }
  },
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
    exclude: [...configDefaults.exclude, "temp/**"],
    environment: "node",
    globals: true
  }
});

