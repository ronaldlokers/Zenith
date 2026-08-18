// Capture from the page you are already looking at (#61).
//
// A bookmarklet rather than an extension, which is what the issue asked for
// as the first cut and is also the only shape that works without new trust:
// /api/v1 is read-only by design, and a script running on a job board cannot
// use Zenith's session cookie from another origin. So it reads what the page
// already publishes about itself and hands that to Zenith's own quick-add,
// where the session already applies and a person still confirms before
// anything is written.
//
// Nothing is posted from the job board, and no permissions are asked for.

export interface CapturedJob {
  title: string | null;
  company: string | null;
  url: string | null;
}

/** The first non-empty string from a list of attribute lookups. */
function firstText(values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function meta(doc: Document, selector: string): string | null {
  return doc.querySelector(selector)?.getAttribute("content") ?? null;
}

/**
 * Anything the page says about itself in a JobPosting.
 *
 * Job boards publish this for search engines, so it is both the most accurate
 * source and the one least likely to change with a redesign. Read defensively:
 * it is third-party JSON on a page Zenith does not control, so a malformed
 * block must be skipped rather than throw the whole capture away.
 */
function fromJsonLd(doc: Document): CapturedJob {
  const empty: CapturedJob = { title: null, company: null, url: null };
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.textContent ?? "");
    } catch {
      continue;
    }
    // A page may ship one object, an array, or a @graph of them.
    const candidates = (
      Array.isArray(parsed)
        ? parsed
        : [parsed, ...((parsed as { "@graph"?: unknown[] })?.["@graph"] ?? [])]
    ).filter((c): c is Record<string, unknown> => !!c && typeof c === "object");

    for (const c of candidates) {
      if (c["@type"] !== "JobPosting") continue;
      const org = c.hiringOrganization as { name?: unknown } | undefined;
      return {
        title: typeof c.title === "string" ? c.title.trim() : null,
        company: typeof org?.name === "string" ? org.name.trim() : null,
        url: typeof c.url === "string" ? c.url.trim() : null,
      };
    }
  }
  return empty;
}

/**
 * What the page says it is about.
 *
 * Deliberately best-effort and in a fixed order of trust: structured data,
 * then Open Graph, then the document itself. The point is a head start over a
 * blank form, not precision — a wrong guess costs one edit, and the person
 * sees every field before it is saved.
 */
export function captureJob(doc: Document, href: string): CapturedJob {
  const structured = fromJsonLd(doc);
  const ogTitle = meta(doc, 'meta[property="og:title"], meta[name="og:title"]');
  const siteName = meta(
    doc,
    'meta[property="og:site_name"], meta[name="og:site_name"]',
  );
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
  const ogUrl = meta(doc, 'meta[property="og:url"], meta[name="og:url"]');

  return {
    title: firstText([structured.title, ogTitle, doc.title]),
    company: firstText([structured.company, siteName]),
    // The address bar last: canonical and og:url are what the page considers
    // its own address, and a listing URL often carries tracking parameters
    // that are not part of it.
    url: firstText([structured.url, canonical, ogUrl, href]),
  };
}

/** The quick-add link a captured job should open. */
export function captureUrl(base: string, job: CapturedJob): string {
  const params = new URLSearchParams({ add: "job" });
  if (job.title) params.set("title", job.title);
  if (job.company) params.set("company", job.company);
  if (job.url) params.set("url", job.url);
  return `${base.replace(/\/$/, "")}/board?${params.toString()}`;
}

/**
 * The bookmarklet itself, as a javascript: URL.
 *
 * Written as a self-contained expression rather than loading a script from
 * Zenith: a bookmarklet that fetches its own body is a remote-code channel
 * into every page the person runs it on, and this needs no update mechanism
 * — it reads standard metadata and hands off.
 */
export function bookmarkletSource(base: string): string {
  const origin = base.replace(/\/$/, "");
  const body = `(function(){
    var m=function(s){var e=document.querySelector(s);return e&&e.getAttribute('content')||''};
    var t=m('meta[property="og:title"]')||document.title||'';
    var c=m('meta[property="og:site_name"]')||'';
    var l=document.querySelector('link[rel="canonical"]');
    var u=(l&&l.getAttribute('href'))||m('meta[property="og:url"]')||location.href;
    try{
      var s=document.querySelectorAll('script[type="application/ld+json"]');
      for(var i=0;i<s.length;i++){
        var d=JSON.parse(s[i].textContent||'null');
        var a=Array.isArray(d)?d:[d].concat((d&&d['@graph'])||[]);
        for(var j=0;j<a.length;j++){
          var o=a[j];
          if(o&&o['@type']==='JobPosting'){
            if(o.title)t=o.title;
            if(o.hiringOrganization&&o.hiringOrganization.name)c=o.hiringOrganization.name;
            if(o.url)u=o.url;
            break;
          }
        }
      }
    }catch(e){}
    var q='add=job&title='+encodeURIComponent(t)+'&company='+encodeURIComponent(c)+'&url='+encodeURIComponent(u);
    window.open('${origin}/board?'+q,'_blank');
  })()`;
  return `javascript:${encodeURIComponent(body.replace(/\s*\n\s*/g, ""))}`;
}
