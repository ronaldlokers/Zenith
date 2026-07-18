// SSRF guard for every server-side fetch of a user-supplied URL (#346).
//
// Cloudflare's production network already refuses direct fetches to
// RFC-1918 space, but that's an implementation detail of one deployment
// target — local dev (workerd on a laptop) will happily fetch
// http://127.0.0.1, and cloud-metadata style endpoints sit on public
// routable addresses of the account's own services. So: defense in depth,
// enforced here for the import scraper, the stale-posting cron, and
// webhook targets.
//
// Workers can't resolve DNS ahead of a fetch, so this is a
// hostname/literal-IP policy check, not a resolved-address check; redirects
// are followed manually so every hop gets the same policy.

const FORBIDDEN_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export function isForbiddenUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h === "" ) return true;
  if (FORBIDDEN_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // IPv6 literals (URL hostname keeps the brackets) — nothing legitimate
  // in this product points at a raw v6 address; block them wholesale
  // rather than enumerating ::1 / fc00::/7 / fe80::/10 shapes.
  if (h.startsWith("[") || h.includes(":")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) || // IETF protocol assignments incl. 192.0.0.0/24
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast + reserved + broadcast
    ) {
      return true;
    }
  }
  return false;
}

const MAX_REDIRECTS = 5;

// fetch() with the policy applied to the initial URL and to every redirect
// hop. Returns the final response plus the final URL (callers that used
// `redirect: "follow"` previously read res.url for it).
export async function guardedFetch(
  rawUrl: string,
  init: Omit<RequestInit, "redirect"> = {},
): Promise<{ res: Response; finalUrl: string }> {
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isForbiddenUrl(current)) {
      throw new Error("url points at a forbidden host");
    }
    const res = await fetch(current.toString(), {
      ...init,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: current.toString() };
      current = new URL(loc, current);
      continue;
    }
    return { res, finalUrl: current.toString() };
  }
  throw new Error("too many redirects");
}
