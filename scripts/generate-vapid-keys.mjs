#!/usr/bin/env node
// One-off: generates a VAPID (P-256 ECDSA) keypair for Web Push (#214).
// No account/signup needed — it's just a keypair, generated locally with
// the Web Crypto API. Run once per deployment (self-hosters generate
// their own; re-running invalidates every existing push subscription
// since the public key baked into each browser's subscription changes):
//
//   node scripts/generate-vapid-keys.mjs
//
// Then set the two values it prints:
//   npx wrangler secret put VAPID_PUBLIC_KEY
//   npx wrangler secret put VAPID_PRIVATE_KEY
//   npx wrangler secret put VAPID_SUBJECT   (mailto:you@example.com)

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  return Uint8Array.from(
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
}

const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

const x = base64UrlToBytes(publicJwk.x);
const y = base64UrlToBytes(publicJwk.y);
const publicKeyBytes = new Uint8Array(65);
publicKeyBytes[0] = 4; // uncompressed EC point prefix
publicKeyBytes.set(x, 1);
publicKeyBytes.set(y, 33);

console.log("VAPID_PUBLIC_KEY=" + bytesToBase64Url(publicKeyBytes));
console.log("VAPID_PRIVATE_KEY=" + privateJwk.d);
console.log("\nSet these as Worker secrets (plus VAPID_SUBJECT):");
console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
console.log("  npx wrangler secret put VAPID_SUBJECT");
