import { defineConfig } from "@playwright/test";

// Two layers:
//  - mock: the UI in a normal browser with sample data (deterministic edge cases), served by Vite.
//  - real: the actual Tauri app on this PC, reached over WebView2's debugging port.
//    Start it with scripts/test-real.ps1, which sets the port for that run only. Never enable the port in tauri.conf.json.
export default defineConfig({
  timeout: 60_000,
  reporter: [["list"]],
  use: { viewport: { width: 1366, height: 700 } },
  projects: [
    { name: "mock", testDir: "e2e/mock", use: { baseURL: "http://localhost:1420" } },
    { name: "real", testDir: "e2e/real" },
  ],
  webServer: process.env.PW_REAL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:1420", reuseExistingServer: true, timeout: 60_000 },
});
