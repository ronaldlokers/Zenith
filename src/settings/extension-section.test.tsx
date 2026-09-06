import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { BrowserExtension } from "./extension-section";
// Side-effect: initializes i18next so t() renders real copy instead of keys.
import "../i18n";

// The extension does one-click save of the posting in the current tab and
// autofills an ATS application form from the profile — the capability the
// competing trackers lead their marketing with. It shipped in #477/#478 and
// the app never mentioned it: not in Settings, not in onboarding, nowhere. A
// first-time user, who PRODUCT.md says has never met the author, had no way
// to find out it existed.
//
// So what is worth pinning is not how the panel looks. It is that the panel
// is reachable at all, and that the instructions still match the extension.
describe("the browser-extension panel", () => {
  it("says what the extension does and how to install it", () => {
    render(<BrowserExtension />);
    expect(screen.getByRole("heading", { name: /browser extension/i })).toBeTruthy();
    // The three steps are a sequence — Developer mode has to be on before
    // Load unpacked appears — so they are a list, not a paragraph.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/load unpacked/i)).toBeTruthy();
    expect(screen.getByText(/api key it asks for is the one below/i)).toBeTruthy();
  });

  it("is mounted in the Integrations section, which is where its README sends people", () => {
    // The README tells the reader to create an API key under
    // "Settings → Integrations". That section exists and is exactly where the
    // key is generated; it simply never mentioned the extension back.
    // Read from the repo root: import.meta.url is an http URL under jsdom,
    // not a file one, so a URL-relative read throws here.
    const settings = readFileSync("src/settings/index.tsx", "utf8");
    const integrations = settings.match(
      /section === "integrations"[\s\S]*?<\/div>/,
    )?.[0];
    expect(integrations, "the Integrations section has moved").toBeTruthy();
    expect(
      integrations!,
      "the extension panel is not rendered where its README points",
    ).toContain("<BrowserExtension />");
  });

  it("describes the folder the extension is actually loaded from", () => {
    // No download link on purpose: it is loaded unpacked from a checkout
    // rather than published to a store, so a URL would be right for exactly
    // one person. That makes the folder name the load-bearing detail — if the
    // extension ever moves, these steps are wrong.
    render(<BrowserExtension />);
    expect(screen.getByText(/extension\/ folder/i)).toBeTruthy();
  });
});
