#!/usr/bin/env node
// One-off: sets the login email/password for the seed admin user created
// by migration 0024 (id 'seed-admin'). Account creation is invite-only
// (#38) — there's no sign-up form — so this is how the first login
// credential gets set, whether that's you or anyone else self-hosting
// this app. Run once after migrations are applied:
//
//   node scripts/seed-admin.mjs <email>
//   npx wrangler d1 execute jobseekr --remote --file scripts/.seed-admin.sql
//
// Prompts for the password interactively (hidden, not echoed) instead of
// taking it as an argument — a CLI arg would land in shell history and be
// visible to anyone on the box via `ps`. The password is hashed locally
// with better-auth's own scrypt implementation so the stored hash is
// byte-for-byte what Better-Auth expects — nothing here talks to D1
// directly, it just prints the SQL.

import { hashPassword } from "better-auth/crypto";
import { writeFileSync } from "node:fs";

const CTRL_C = "\x03";
const BACKSPACE = "\x7f";

const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/seed-admin.mjs <email>");
  process.exit(1);
}

if (!process.stdin.isTTY) {
  console.error(
    "This needs an interactive terminal to prompt for a password (stdin isn't a TTY).",
  );
  process.exit(1);
}

// A single long-lived raw-mode reader for both prompts below. Both typed
// lines (e.g. password + confirmation, typed quickly) can arrive as one
// buffered chunk, processed synchronously in the 'data' handler below —
// but the *second* promptHidden() call only registers its resolver in a
// microtask after the first one's promise resolves, i.e. after that
// handler returns. So a completed line has nowhere to go if nobody's
// waiting for it yet — this queues finished lines too (not just waiting
// resolvers), like a small unbounded channel, so whichever side is ready
// first, isn't lost waiting on the other.
let lineBuffer = "";
const waitingResolvers = [];
const completedLines = [];

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", (chunk) => {
  for (const char of chunk.toString("utf8")) {
    if (char === CTRL_C) {
      process.stdout.write("\n");
      process.exit(130);
    } else if (char === "\n" || char === "\r") {
      const line = lineBuffer;
      lineBuffer = "";
      process.stdout.write("\n");
      const resolve = waitingResolvers.shift();
      if (resolve) resolve(line);
      else completedLines.push(line);
    } else if (char === BACKSPACE || char === "\b") {
      lineBuffer = lineBuffer.slice(0, -1);
    } else {
      lineBuffer += char;
    }
  }
});

function promptHidden(question) {
  process.stdout.write(question);
  if (completedLines.length > 0) {
    return Promise.resolve(completedLines.shift());
  }
  return new Promise((resolve) => waitingResolvers.push(resolve));
}

const password = await promptHidden("Password: ");
if (!password || password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
const confirmed = await promptHidden("Confirm password: ");
process.stdin.setRawMode(false);
process.stdin.pause();
if (confirmed !== password) {
  console.error("Passwords didn't match — nothing was written.");
  process.exit(1);
}

const escape = (s) => s.replace(/'/g, "''");
const hash = await hashPassword(password);
const now = new Date().toISOString();

// Fixed account id so re-running this script (e.g. to reset the password)
// replaces the same credential row instead of accumulating duplicate
// accounts for the same user.
const sql = `UPDATE "user" SET email = '${escape(email)}', "updatedAt" = '${now}' WHERE id = 'seed-admin';
INSERT OR REPLACE INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
VALUES ('seed-admin-credential', 'seed-admin', 'credential', 'seed-admin', '${hash}', '${now}', '${now}');`;

writeFileSync(new URL("./.seed-admin.sql", import.meta.url), sql);
console.log("Wrote scripts/.seed-admin.sql — now run:");
console.log(
  "  npx wrangler d1 execute jobseekr --remote --file scripts/.seed-admin.sql",
);
console.log(`\nThen log in with ${email} and the password you just entered.`);
