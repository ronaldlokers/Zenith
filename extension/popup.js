// Zenith "Save Job" popup. Extracts the posting's title + company from the
// active tab (JobPosting JSON-LD first, then Open Graph, then <title>), lets
// the user tweak them, and POSTs to the Zenith create endpoint with the
// stored API key. No build step — plain MV3.
const $ = (id) => document.getElementById(id);

async function extractFromPage(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const meta = (n) =>
        document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)
          ?.content || null;
      let title = null;
      let company = null;
      for (const s of document.querySelectorAll(
        'script[type="application/ld+json"]',
      )) {
        try {
          const data = JSON.parse(s.textContent);
          for (const d of Array.isArray(data) ? data : [data]) {
            if (d && d["@type"] === "JobPosting") {
              title = title || d.title || null;
              company =
                company ||
                (d.hiringOrganization && d.hiringOrganization.name) ||
                null;
            }
          }
        } catch {
          /* ignore malformed JSON-LD */
        }
      }
      title = title || meta("og:title") || document.title || "";
      company = company || meta("og:site_name") || "";
      return { title, company };
    },
  });
  return result || { title: "", company: "" };
}

async function init() {
  const { baseUrl, apiKey } = await chrome.storage.sync.get([
    "baseUrl",
    "apiKey",
  ]);
  if (!baseUrl || !apiKey) {
    $("setup").style.display = "block";
    $("form").style.display = "none";
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").value = tab?.url || "";
  try {
    const ex = await extractFromPage(tab.id);
    $("title").value = ex.title;
    $("company").value = ex.company;
  } catch {
    /* page not scriptable (e.g. chrome:// ) — leave blank */
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = kind || "";
}

$("save").addEventListener("click", async () => {
  const { baseUrl, apiKey } = await chrome.storage.sync.get([
    "baseUrl",
    "apiKey",
  ]);
  const title = $("title").value.trim();
  if (!title) {
    setStatus("Add a job title first.", "err");
    return;
  }
  setStatus("Saving…");
  $("save").disabled = true;
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/applications`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          company: $("company").value.trim(),
          url: $("url").value.trim(),
          source: "extension",
        }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setStatus("Saved to your pipeline ✓", "ok");
  } catch (e) {
    setStatus(`Couldn't save: ${e.message}`, "err");
    $("save").disabled = false;
  }
});

// Injected into the page: fill common application-form fields from the
// profile. Self-contained (runs in the page, no closure over popup scope).
// Matches by name/id/placeholder/aria-label/autocomplete and associated label
// text; skips fields the user already filled. Returns the count filled.
function autofillPage(profile) {
  const parts = (profile.name || "").trim().split(/\s+/);
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const map = [
    { keys: ["given-name", "first name", "firstname", "first_name", "fname"], val: first },
    { keys: ["family-name", "last name", "lastname", "last_name", "surname", "lname"], val: last },
    { keys: ["full name", "fullname", "your name", "legal name"], val: profile.name },
    { keys: ["email", "e-mail"], val: profile.email },
    { keys: ["phone", "tel", "mobile", "telephone"], val: profile.phone },
    { keys: ["linkedin"], val: profile.linkedin },
    { keys: ["github"], val: profile.github },
    { keys: ["portfolio", "personal site", "personal website"], val: profile.portfolio },
    { keys: ["city", "location"], val: profile.location },
  ];
  const haystack = (el) => {
    const forLabel = el.id
      ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent
      : "";
    const wrapLabel = el.closest("label")?.textContent || "";
    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
      forLabel,
      wrapLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  };
  const nativeSet = (el, value) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      setter.call(el, value);
    } catch {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  let filled = 0;
  for (const el of document.querySelectorAll("input, textarea")) {
    const skip =
      el.disabled ||
      el.value ||
      ["hidden", "password", "file", "checkbox", "radio", "submit"].includes(
        el.type,
      );
    if (skip) continue;
    const h = haystack(el);
    for (const m of map) {
      if (m.val && m.keys.some((k) => h.includes(k))) {
        nativeSet(el, m.val);
        filled++;
        break;
      }
    }
  }
  return filled;
}

$("autofill").addEventListener("click", async () => {
  const { baseUrl, apiKey } = await chrome.storage.sync.get([
    "baseUrl",
    "apiKey",
  ]);
  setStatus("Fetching your profile…");
  let profile;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/profile`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    profile = await res.json();
  } catch (e) {
    setStatus(`Couldn't load your profile: ${e.message}`, "err");
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: autofillPage,
      args: [profile],
    });
    setStatus(
      result > 0
        ? `Filled ${result} field${result === 1 ? "" : "s"} ✓`
        : "No matching fields found on this page.",
      result > 0 ? "ok" : "",
    );
  } catch (e) {
    setStatus(`Autofill failed: ${e.message}`, "err");
  }
});

$("open-options-setup").addEventListener("click", () =>
  chrome.runtime.openOptionsPage(),
);

init();
