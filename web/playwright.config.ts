import { defineConfig } from "@playwright/test";

const PORT = 8099;

// Runs against the real Go server serving the last web build (`make e2e` builds first).
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.test.ts / *.spec.ts, which `bun test` would pick up
  timeout: 30_000,
  workers: 1, // the server holds a single Room, so tests can't run side by side
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `go run . -port ${PORT}`,
    cwd: "../server",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
