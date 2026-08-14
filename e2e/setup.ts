import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Everything the browser suite needs standing up, in one place: a built app
// behind the real worker, a local D1 with the migrations applied, a user with
// a password we know, and a saved session for the specs to reuse.
//
// The password is generated per run and never written to the repo. The
// seed-admin user itself comes from migration 0024 — account creation is
// invite-only, so there is no sign-up to drive.
export const BASE = "http://127.0.0.1:8799";
export const STATE = "e2e/.auth.json";

const D1 = "zenith";

function sh(cmd: string, args: string[]) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function waitFor(url: string, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} never came up`);
}

let server: ReturnType<typeof spawn> | null = null;

export async function setup() {
  sh("npx", ["wrangler", "d1", "migrations", "apply", D1, "--local"]);

  // better-auth's scrypt format, produced the same way the app does.
  const password = randomBytes(18).toString("base64url");
  // Imported by absolute file URL, not as a bare specifier: better-auth's
  // exports field does not expose dist/crypto, so Vite refuses to resolve it.
  // The path is built at runtime so it is not statically analysed either.
  const cryptoUrl = pathToFileURL(
    resolve("node_modules/better-auth/dist/crypto/index.mjs"),
  ).href;
  const { hashPassword } = (await import(/* @vite-ignore */ cryptoUrl)) as {
    hashPassword: (p: string) => Promise<string>;
  };
  const hash = await hashPassword(password);
  // INSERT OR REPLACE, not UPDATE. Migration 0024 creates the seed-admin user
  // and says in its own comment that it deliberately leaves the password to a
  // script — so on a fresh checkout there is no account row at all, and an
  // UPDATE changes nothing and reports success. That is why this passed
  // locally, where an earlier run had left a credential behind, and failed in
  // CI on the first attempt.
  sh("npx", [
    "wrangler", "d1", "execute", D1, "--local", "--command",
    `INSERT OR REPLACE INTO account
       (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES ('seed-admin-credential', 'seed-admin', 'credential', 'seed-admin',
             '${hash}', datetime('now'), datetime('now'))`,
  ]);
  // A predictable board. The seeded profile folds four rails away, so a
  // quick-added application lands in a folded one and is invisible — which
  // looked like a failed save until the row turned up in D1. Rows from an
  // earlier run go too, so the suite is repeatable rather than accumulating.
  sh("npx", [
    "wrangler", "d1", "execute", D1, "--local", "--command",
    "UPDATE profile SET board_folded = ''; DELETE FROM applications WHERE title LIKE 'E2E %'",
  ]);
  const email = sh("npx", [
    "wrangler", "d1", "execute", D1, "--local", "--json", "--command",
    "SELECT email FROM \"user\" WHERE id = 'seed-admin'",
  ]);
  const address = JSON.parse(email)[0].results[0].email as string;

  // Its own process group, so teardown can take the whole tree down. Killing
  // just the npx shim leaves workerd running and vitest waiting on it — "close
  // timed out after 10000ms" in CI.
  server = spawn("npx", ["wrangler", "dev", "--local", "--port", "8799"], {
    stdio: "ignore",
    detached: true,
  });
  server.unref();
  await waitFor(BASE + "/");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE + "/");
  await page.fill("input[type=email]", address);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForSelector(".login-stage", { state: "detached", timeout: 30_000 });
  await context.storageState({ path: STATE });
  await browser.close();
}

export async function teardown() {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
}
