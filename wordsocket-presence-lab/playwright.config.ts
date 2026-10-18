import "./tests/e2e/env";
import { defineConfig } from "@playwright/test";
import baseConfig from "@wordpress/scripts/config/playwright.config";

/*
 * WordSocket's own Playwright setup, pointed at the lab's specs: the run owns
 * the rehearsal relay (started with the E2E site pinned at it, killed when the
 * run ends), so every case sees the relay's real presence and keepalive.
 */
export default defineConfig({
  ...baseConfig,
  testDir: "tests/e2e",
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
  webServer: {
    command: `${process.env.WPS_LOCAL_TLS} --e2e-site ${process.env.WP_ROOT} --seed-e2e`,
    env: {
      E2E_EMAIL: process.env.WPS_E2E_EMAIL!,
      E2E_PASSWORD: process.env.WPS_E2E_PASSWORD!,
    },
    url: `${process.env.WPS_API_URL}/healthz`,
    ignoreHTTPSErrors: true,
    /*
     * Unlike WordSocket's suite, a stack already on 8443 is used as it is: the
     * lab only reads presence and writes its own table, so a relay someone
     * started by hand is not at risk, and that relay stays up afterwards.
     */
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  // Cases run one at a time: they share one board and one relay.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
});
