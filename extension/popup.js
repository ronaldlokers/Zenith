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

$("open-options-setup").addEventListener("click", () =>
  chrome.runtime.openOptionsPage(),
);

init();
