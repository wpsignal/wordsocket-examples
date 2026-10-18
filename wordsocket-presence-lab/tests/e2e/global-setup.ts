import { WPS_API_URL, WPS_E2E_EMAIL, WP_PASSWORD, WP_USERNAME, dashboardLogin, storedSiteKey, wp } from "./env";
import { request, type FullConfig } from "@playwright/test";
import { RequestUtils } from "@wordpress/e2e-test-utils-playwright";
import { existsSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";

const SLUG = "wordsocket-presence-lab";

/*
 * WordSocket's global setup, trimmed to what the lab needs: refuse anything
 * but the pinned E2E site, make sure the administrator exists, symlink and
 * activate this plugin, log in, and leave the site connected to the rehearsal
 * relay so visitors get tokens.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const env = wp("eval", "echo wp_get_environment_type();");
  if (!["local", "development"].includes(env)) {
    throw new Error(`Refusing to run against a '${env}' site; expected local or development.`);
  }
  if (wp("plugin", "list", "--name=wordsocket", "--status=active", "--field=name") !== "wordsocket") {
    throw new Error("WordSocket is not active on the target site.");
  }
  const serverUrl = wp("eval", "echo \\WPSignal\\WPS::instance()->config()->base_url();");
  if (serverUrl.replace(/\/$/, "") !== WPS_API_URL.replace(/\/$/, "")) {
    throw new Error(`The target site talks to ${serverUrl}, not the rehearsal server ${WPS_API_URL}.`);
  }

  const link = resolve(process.env.WP_ROOT!, `wp-content/plugins/${SLUG}`);
  if (!existsSync(link)) {
    symlinkSync(resolve(__dirname, "../.."), link);
  }
  if (wp("plugin", "list", `--name=${SLUG}`, "--status=active", "--field=name") !== SLUG) {
    wp("plugin", "activate", SLUG);
  }

  if (wp("user", "list", `--login=${WP_USERNAME}`, "--field=user_login") !== WP_USERNAME) {
    wp("user", "create", WP_USERNAME, `${WP_USERNAME}@example.com`, "--role=administrator", `--user_pass=${WP_PASSWORD}`);
  } else {
    wp("user", "update", WP_USERNAME, `--user_pass=${WP_PASSWORD}`);
  }

  const { storageState, baseURL } = config.projects[0].use;
  const storageStatePath = typeof storageState === "string" ? storageState : undefined;
  const requestContext = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const requestUtils = new RequestUtils(requestContext, { storageStatePath });
  await requestUtils.setupRest();

  // Connected with the seeded account's key, repaired if a previous run left it otherwise.
  const session = await dashboardLogin();
  const settings = await requestUtils.rest({ path: "/wpsignal/v1/settings" });
  if (!settings?.is_connected) {
    if (storedSiteKey() !== "") {
      await requestUtils.rest({ method: "POST", path: "/wpsignal/v1/disconnect" });
    }
    const response = await requestUtils.rest({
      method: "POST",
      path: "/wpsignal/v1/connect",
      data: { api_key: session.api_key },
    });
    if (!response?.site_key) {
      throw new Error(`Could not connect the E2E site as ${WPS_E2E_EMAIL}: ${JSON.stringify(response)}`);
    }
  }
  await requestContext.dispose();
}
