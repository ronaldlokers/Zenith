import type { Hono } from "hono";
import { guardedFetch, isForbiddenUrl } from "./url-guard.js";
import type { AppEnv } from "./index.js";

// Best-effort job-posting scraper, lifted out of worker/index.ts (#100). Three
// parsing helpers and one route, none of it reachable from anywhere else in
// the worker.
//
// The fetch goes through guardedFetch because the URL comes from the user and
// this runs server-side — see worker/url-guard.ts (#346).

// --- Import job posting from URL (best effort) ---

interface ImportResult {
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  source: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function metaContent(html: string, key: string): string | null {
  // Matches <meta property="og:x" content="..."> in either attribute order
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function findJobPosting(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findJobPosting(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
    return obj;
  }
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

export function registerImportRoutes(app: Hono<AppEnv>) {
  app.get("/api/import", async (c) => {
  const raw = c.req.query("url");
  if (!raw) return c.json({ error: "url query param is required" }, 400);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return c.json({ error: "invalid url" }, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return c.json({ error: "only http(s) urls are supported" }, 400);
  }
  if (isForbiddenUrl(url)) {
    return c.json({ error: "url points at a forbidden host" }, 400);
  }

  let html: string;
  try {
    const { res } = await guardedFetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return c.json(
        { error: `page returned ${res.status} — fill in manually` },
        502,
      );
    }
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return c.json({ error: "could not fetch page — fill in manually" }, 502);
  }

  const result: ImportResult = {
    title: null,
    company: null,
    location: null,
    salary: null,
    source: url.hostname.replace(/^www\./, ""),
  };

  // JSON-LD JobPosting is the richest source
  const ldBlocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of ldBlocks) {
    try {
      const posting = findJobPosting(JSON.parse(m[1]));
      if (!posting) continue;
      result.title = (posting.title as string) ?? null;
      const org = posting.hiringOrganization as
        | { name?: string }
        | string
        | undefined;
      result.company =
        typeof org === "string" ? org : (org?.name ?? null);
      const loc = posting.jobLocation as
        | { address?: { addressLocality?: string } }
        | Array<{ address?: { addressLocality?: string } }>
        | undefined;
      const addr = Array.isArray(loc) ? loc[0]?.address : loc?.address;
      result.location = addr?.addressLocality ?? null;
      const salary = posting.baseSalary as
        | { value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }; currency?: string }
        | undefined;
      if (salary?.value) {
        const v = salary.value;
        const cur = salary.currency ?? "";
        result.salary = v.minValue
          ? `${cur} ${v.minValue}–${v.maxValue ?? v.minValue} ${v.unitText ?? ""}`.trim()
          : v.value
            ? `${cur} ${v.value} ${v.unitText ?? ""}`.trim()
            : null;
      }
      break;
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  // OpenGraph / title fallbacks
  if (!result.title) {
    result.title =
      metaContent(html, "og:title") ??
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
        ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1])
        : null);
  }
  if (!result.company) {
    result.company = metaContent(html, "og:site_name");
  }

  return c.json(result);
});
}
