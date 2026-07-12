import { defineConfig } from "@playwright/test";

const CLIENT_PORT = 5273;
const SERVER_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "bun run test:start",
      cwd: "server",
      url: `http://localhost:${SERVER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      command: `bun run dev -- --port ${CLIENT_PORT} --strictPort`,
      cwd: "client",
      url: `http://localhost:${CLIENT_PORT}`,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${SERVER_PORT}` },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
  ],
});
