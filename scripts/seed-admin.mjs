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
import { createInterface } from "node:readline";

const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/seed-admin.mjs <email>");
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // readline has no built-in mask option, so we take over the output
    // stream's _writeToOutput to swallow everything except the prompt
    // itself — the raw keystrokes still reach readline's line buffer,
    // they just never get echoed back to the terminal.
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await promptHidden("Password (min 8 chars): ");
if (!password || password.length < 8) {
  console.error("Password must be at least 8 characters.");
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
