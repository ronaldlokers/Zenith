# Zenith — Save Job (browser extension)

One-click save of the job posting in your current tab straight into your Zenith
pipeline. A minimal Manifest V3 extension — no build step.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Click the extension's **Details → Extension options** and set:
   - **Zenith URL** — your instance, e.g. `https://your-zenith.example`
   - **API key** — create one in Zenith under **Settings → Integrations**.

## Use

On any job posting, click the toolbar icon. The popup pre-fills the title and
company (from the page's `JobPosting` structured data, then Open Graph, then the
tab title) and the URL — tweak if needed and hit **Save to pipeline**. It lands
as an `interested` application, tagged `source: extension`.

## Autofill an application form

On an ATS application page, open the popup and hit **Autofill this application
form**. It pulls your contact basics from Zenith (`GET /api/v1/profile`) and
fills matching fields — first/last/full name, email, phone, LinkedIn, GitHub,
portfolio, city — matched by each field's name, id, placeholder, `aria-label`,
`autocomplete`, and label text. It only touches empty fields and never fills
passwords, file inputs, or checkboxes; you review and submit yourself.

Heuristic by nature — coverage varies by ATS. It reports how many fields it
filled.

## How it saves

`POST {baseUrl}/api/v1/applications` with `Authorization: Bearer <key>` and a
JSON body of `{ title, company, url, source }`. The company name is
find-or-created. No compensation data is sent or accepted. Autofill reads
`GET {baseUrl}/api/v1/profile` (contact fields only — no summary, no comp).

## Notes

- `host_permissions` is `<all_urls>` so the popup can read any job page and post
  to any configured Zenith URL. Narrow it to your instance + the boards you use
  if you prefer.
- Icons are intentionally omitted; the browser shows a default. Drop `icon16/48/128`
  PNGs in and reference them under `action.default_icon` / `icons` to brand it.
