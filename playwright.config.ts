import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT || "1420";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  fullyParallel: false,
  use: {
    actionTimeout: 10000,
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
