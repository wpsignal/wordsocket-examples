import { WP_ROOT } from "./env";
import { expect, test } from "@wordpress/e2e-test-utils-playwright";
import { chromium, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { RequestUtils } from "@wordpress/e2e-test-utils-playwright";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/*
 * The six exit criteria of the presence lab. Each is a pass or a fail, not an
 * impression: `page` is the administrator's board, every visitor is a fresh
 * anonymous context unless the case says otherwise.
 */

const BOARD = "/wp-admin/admin.php?page=wordsocket-presence-lab";
const HELLO = "/?p=1";
const GRACE_MS = 6_000;

interface StoredRow {
  visitor: string;
  user_id: number | null;
  journey: string;
  first_seen: string;
  last_seen: string;
  left_at: string | null;
}

async function connected(page: Page): Promise<void> {
  // Polled as text so a failure shows the client's own state, not just `false`.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          JSON.stringify({
            connected: window.WPS?.state.connected ?? false,
            state: window.WPS ? { ...window.WPS.state } : "no WPS",
            config: typeof window.wpSignalConfig === "undefined" ? "no config" : "config",
            lab: window.wordsocketPresenceLab ?? "no lab config",
          }),
        ),
      { timeout: 20_000 },
    )
    .toMatch(/^\{"connected":true/);
}

function visitorId(page: Page): Promise<string> {
  return page.evaluate(() => window.WPS!.visitorId());
}

async function openBoard(page: Page): Promise<void> {
  await page.goto(BOARD);
  await expect(page.locator("#presence-lab")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}

function liveRow(board: Page, v: string) {
  return board.locator(`.lab-live tbody tr[data-visitor="${v}"]`);
}

async function storedRow(requestUtils: RequestUtils, v: string): Promise<StoredRow | null> {
  const data = (await requestUtils.rest({ path: "/presence-lab/v1/rows" })) as { rows: StoredRow[] };
  return data.rows.find((row) => row.visitor === v) ?? null;
}

/*
 * A fresh anonymous visitor. Inside the test runner `browser.newContext()`
 * applies the project's `use` options, storage state included, so without the
 * empty state every "visitor" would be the logged-in administrator.
 */
async function visitorPage(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

// Playwright cannot hide a tab for real; the page's own `document.hidden` can be made to say so.
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isHidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test.describe("Presence lab", () => {
  test("1. a navigation is not a leave", async ({ page, browser, baseURL, requestUtils }) => {
    await openBoard(page);
    const { context, page: visitor } = await visitorPage(browser, baseURL!);
    await visitor.goto("/");
    await connected(visitor);
    const v = await visitorId(visitor);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "live");

    await visitor.goto(HELLO);
    await connected(visitor);

    // Through the navigation and the grace after it, the row never goes.
    const until = Date.now() + GRACE_MS + 2_000;
    while (Date.now() < until) {
      expect(await liveRow(page, v).count(), "the visitor stayed on the board").toBe(1);
      await page.waitForTimeout(250);
    }
    await expect(liveRow(page, v)).toHaveAttribute("data-journey", /^home:\d+:\d+>post:1:\d+$/);

    // WordPress holds both steps, and the leave of the first page did not win over the visit of the second.
    await expect.poll(async () => (await storedRow(requestUtils, v))?.journey ?? "").toMatch(/^home:\d+:\d+>post:1:\d+$/);
    expect((await storedRow(requestUtils, v))?.left_at).toBeNull();
    await context.close();
  });

  test("2. a closed tab is a leave", async ({ page, browser, baseURL, requestUtils }) => {
    await openBoard(page);
    const { context, page: visitor } = await visitorPage(browser, baseURL!);
    await visitor.goto("/");
    await connected(visitor);
    const v = await visitorId(visitor);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "live");
    await expect.poll(async () => (await storedRow(requestUtils, v))?.journey ?? "").toMatch(/^home:\d+:\d+$/);
    expect((await storedRow(requestUtils, v))?.user_id, "a guest is stored as a guest").toBeNull();

    await visitor.close();

    // WordPress hears it from the leave; the board from the relay, after the grace.
    await expect.poll(async () => (await storedRow(requestUtils, v))?.left_at ?? null, { timeout: 10_000 }).not.toBeNull();
    await expect(liveRow(page, v)).toHaveCount(0, { timeout: GRACE_MS + 5_000 });
    await context.close();
  });

  test("3. a hidden tab reads away, and the time lands in the journey", async ({ page, browser, baseURL }) => {
    await openBoard(page);
    const { context, page: visitor } = await visitorPage(browser, baseURL!);
    await visitor.goto("/");
    await connected(visitor);
    const v = await visitorId(visitor);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "live");

    await setHidden(visitor, true);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "away");
    await expect(liveRow(page, v)).toHaveAttribute("data-journey", /^home:\d+:\d+>away:0:\d+$/);

    await visitor.waitForTimeout(1_500);
    await setHidden(visitor, false);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "live");
    const journey = (await liveRow(page, v).getAttribute("data-journey")) ?? "";
    const match = journey.match(/^home:\d+:\d+>away:0:(\d+)>home:\d+:\d+$/);
    expect(match, `journey ${journey}`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(1_400);
    await context.close();
  });

  test("4. a killed browser is gone from the board with no leave reported", async ({ page, baseURL, requestUtils }) => {
    test.setTimeout(90_000);
    await openBoard(page);

    // A browser process of its own, so it can be killed rather than closed.
    const server = await chromium.launchServer();
    const doomed = await chromium.connect(server.wsEndpoint());
    const context = await doomed.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
    const visitor = await context.newPage();
    await visitor.route("**/presence-lab/v1/leave", (route) => route.abort());
    await visitor.goto("/");
    await connected(visitor);
    const v = await visitorId(visitor);
    await expect(liveRow(page, v)).toHaveAttribute("data-state", "live");
    await expect.poll(async () => (await storedRow(requestUtils, v))?.journey ?? "").toMatch(/^home:\d+:\d+$/);

    const started = Date.now();
    await server.kill();

    /*
     * No pagehide, no leave: the relay alone notices. The OS closes the dead
     * process's sockets at once, so this is seconds; the 45 s keepalive
     * deadline is the bound for a socket that stays half-open, which the
     * relay's own tests cover.
     */
    await expect(liveRow(page, v)).toHaveCount(0, { timeout: 45_000 + GRACE_MS + 5_000 });
    test.info().annotations.push({ type: "gone after", description: `${Date.now() - started} ms` });
    expect((await storedRow(requestUtils, v))?.left_at ?? null, "WordPress never heard a leave").toBeNull();
  });

  test("5. a logged-in visitor keeps one identity across pages and a reload", async ({ page, requestUtils }) => {
    await openBoard(page);
    // Same context as the board: logged in as the administrator.
    const visitor = await page.context().newPage();
    await visitor.goto("/");
    await connected(visitor);
    const v = await visitorId(visitor);
    await visitor.goto(HELLO);
    await connected(visitor);
    await visitor.reload();
    await connected(visitor);
    expect(await visitorId(visitor)).toBe(v);

    await expect
      .poll(async () => (await storedRow(requestUtils, v))?.journey ?? "")
      .toMatch(/^home:\d+:\d+>post:1:\d+>post:1:\d+$/);
    const row = await storedRow(requestUtils, v);
    expect(row?.user_id ?? 0).toBeGreaterThan(0);
    expect(row?.left_at).toBeNull();
    await visitor.close();
  });

  test("6. a cached copy of a page still produces the right journey", async ({ page, browser, baseURL, requestUtils }) => {
    await openBoard(page);

    // The HTML a full-page cache would hold: rendered for a guest, no nonce in it.
    // A context of its own: `request.newContext()` would inherit the administrator's storage state.
    const guest = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
    const html = await (await guest.get(HELLO)).text();
    await guest.dispose();
    const inline = html.match(/window\.wordsocketPresenceLab = (\{.*?\});/);
    expect(inline, "the lab config is in the page").not.toBeNull();
    const labConfig = JSON.parse(inline![1]) as { kind: string; id: number; nonce?: string };
    expect(labConfig).toMatchObject({ kind: "post", id: 1 });
    expect(labConfig.nonce, "a guest page carries no nonce").toBeUndefined();

    /*
     * Served the way a page cache serves it: a static file from the site's own
     * web server. (A `route.fulfill` copy has no address space, and Chrome's
     * local network access check then refuses the loopback relay.)
     */
    const cachedPath = "wp-content/uploads/presence-lab-cached.html";
    const cachedFile = resolve(WP_ROOT, cachedPath);
    await writeFile(cachedFile, html, "utf8");
    const { context, page: visitor } = await visitorPage(browser, baseURL!);
    const consoleLines: string[] = [];
    visitor.on("console", (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
    visitor.on("pageerror", (error) => consoleLines.push(`pageerror: ${error.message}`));
    try {
      await visitor.goto(`/${cachedPath}`);
      try {
        await connected(visitor);
      } catch (error) {
        throw new Error(`${(error as Error).message}\nconsole:\n${consoleLines.join("\n")}`);
      }
      const v = await visitorId(visitor);

      // The step comes from the markup, not the URL it was served at.
      await expect(liveRow(page, v)).toHaveAttribute("data-journey", /^post:1:\d+$/);
      await expect.poll(async () => (await storedRow(requestUtils, v))?.journey ?? "").toMatch(/^post:1:\d+$/);
    } finally {
      await context.close();
      await rm(cachedFile, { force: true });
    }
  });
});
