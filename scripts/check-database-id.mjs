#!/usr/bin/env node
// Preflight for `wrangler d1 migrations apply zenith --remote`. SELF_HOSTING.md
// step 2 has the reader replace wrangler.jsonc's committed database_id with
// their own — nothing enforced that step, so skipping it just migrates
// whatever database_id happens to be configured. The committed id is real
// production for this repo's own deploy (.github/workflows/deploy.yml runs
// migrations against it on every push to main), so the fix can't be "make
// wrangler.jsonc invalid by default" — it has to recognize this one specific
// id and reject only that.
//
//   node scripts/check-database-id.mjs
//
// Wired into `npm run migrate:remote` (see package.json and SELF_HOSTING.md
// step 5), so a self-hoster who forgot the swap gets a message pointing back
// at the step, instead of a wrangler auth error with no lead back to the fix.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The database_id this repo has always shipped in wrangler.jsonc. Not a
// placeholder — production reads this exact value.
export const UPSTREAM_DATABASE_ID = "ca1cf5c8-4d60-4bb6-80dc-89265bd4e9aa";

// wrangler.jsonc is JSONC (it carries comments), so a bare JSON.parse of the
// file can throw. Pull just the value out with a targeted match instead of
// parsing the whole document — robust to the rest of the file being
// reformatted, as long as the key/value pair itself stays intact.
export function readDatabaseId(text) {
  const match = text.match(/"database_id"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("no database_id found in wrangler.jsonc");
  return match[1];
}

export function checkDatabaseId(databaseId) {
  if (databaseId !== UPSTREAM_DATABASE_ID) return;
  throw new Error(
    "wrangler.jsonc still has the upstream Zenith database_id.\n" +
      "SELF_HOSTING.md step 2 has you run `npx wrangler d1 create zenith` and replace " +
      "d1_databases[0].database_id in wrangler.jsonc with the id it prints. That step " +
      "hasn't happened, so this would migrate against the upstream project's own " +
      "database instead of yours.",
  );
}

function main() {
  const path = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
  checkDatabaseId(readDatabaseId(readFileSync(path, "utf8")));
  console.log("wrangler.jsonc database_id is not the upstream one. Proceeding.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`check-database-id: ${error.message}`);
    process.exit(1);
  }
}
