// Shared credential storage for the Zenith extension's popup and options
// pages. The API key lives in chrome.storage.local only: chrome.storage.sync
// replicates it in cleartext to the user's Google account and to every
// browser profile signed into it, widening a credential that reads the
// whole pipeline and can create applications. Keys are issued per device
// (shown once, on setup), which is what local storage matches.
//
// getCredentials() also carries the one-time migration for anyone who
// installed before this fix: if `local` has no key but `sync` does, it
// copies the key to `local` and then removes it from `sync`. The removal
// is the actual security fix — leaving the old copy in `sync` while writing
// new keys to `local` would still replicate the credential. This read/
// remove path has to stay: a version that stops reading `sync` strands
// every existing user with a popup that looks unconfigured.
//
// The removal does mean a second machine signed into the same profile loses
// the key and has to be given one again. That is the point rather than a
// regression — the key is issued per device — so do not "fix" it by leaving
// the copy in `sync`, which is the whole defect.
export async function getCredentials() {
  let { baseUrl, apiKey } = await chrome.storage.local.get([
    "baseUrl",
    "apiKey",
  ]);
  if (!apiKey) {
    const legacy = await chrome.storage.sync.get(["baseUrl", "apiKey"]);
    if (legacy.apiKey) {
      baseUrl = legacy.baseUrl;
      apiKey = legacy.apiKey;
      await chrome.storage.local.set({ baseUrl, apiKey });
      await chrome.storage.sync.remove(["baseUrl", "apiKey"]);
    }
  }
  return { baseUrl, apiKey };
}

// Never write credentials back to sync storage anywhere in extension/ —
// that replication to the user's Google account is exactly what this
// module exists to stop.
export async function setCredentials(baseUrl, apiKey) {
  await chrome.storage.local.set({ baseUrl, apiKey });
}
