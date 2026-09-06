import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The narrower refresh only saves anything where it is actually wired. The
// behaviour is covered in src/targeted-reload.test.tsx; this is the half that
// spec cannot see — that the two network tabs use it, and that the tabs which
// genuinely do change stats have not been quietly moved onto it too.
const ROOT = new URL("..", import.meta.url).pathname;
const APP = readFileSync(`${ROOT}src/App.tsx`, "utf8");

const onChangedFor = (tab: string): string => {
  const at = APP.indexOf(`<${tab}`);
  expect(at, `${tab} is not rendered in App.tsx any more`).toBeGreaterThan(-1);
  const slice = APP.slice(at, at + 800);
  return slice.match(/onChanged=\{(\w+)\}/)?.[1] ?? "";
};

describe("which refresh each tab gets", () => {
  it("gives the network tabs the narrow one", () => {
    expect(onChangedFor("CompaniesTab")).toBe("reloadNetwork");
    expect(onChangedFor("ContactsTab")).toBe("reloadNetwork");
  });

  it("leaves the tabs that change stats on the full one", () => {
    // These move applications between statuses, add applications from the
    // feed, or write interactions — all of which /api/stats reads. Putting
    // them on the narrow refresh would leave the dashboard's numbers stale,
    // which is a worse bug than the fetch it saves.
    for (const tab of ["DashboardTab", "PipelineTab", "FeedTab", "ApplicationDetailModal"]) {
      expect(onChangedFor(tab), `${tab} would show stale stats`).toBe("reload");
    }
  });
});
