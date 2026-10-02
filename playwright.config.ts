import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:5175",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1050 },
  },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175",
      url: "http://127.0.0.1:5175",
      env: { PILOT_API_URL: "http://127.0.0.1:8011" },
      reuseExistingServer: false,
    },
    {
      command: ".venv\\Scripts\\python.exe scripts/e2e_backend.py",
      url: "http://127.0.0.1:8011/api/health",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
