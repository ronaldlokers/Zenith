import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "./i18n";
import { FeedCard } from "./feed";
import type { FeedItem } from "./types";

// The desktop pane orders Add · Keep · Dismiss, and the keyboard hint prints
// a/s/d in that same order. The narrow row put Keep first, so the primary
// action sat mid-row on the one surface where triage is a thumb repeating the
// same motion — the two orders disagreed, and muscle memory built on either
// misfired on the other.
//
// Asserted as an order rather than fixed positions: what has to hold is that
// the surfaces agree, so a later redesign moving all three together stays
// free.
const item = {
  id: 1,
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/job",
  source: "greenhouse",
  status: null,
  posted_at: "2026-09-01",
  created_at: "2026-09-01",
  location: null,
  salary_text: null,
  role_type: null,
  match_count: null,
  match_skills: [],
  description_snippet: null,
  fetched_at: "2026-09-01",
} as unknown as FeedItem;

const noop = () => {};

function actionLabels(): string[] {
  const row = document.querySelector(".feed-row-actions");
  return [...(row?.querySelectorAll("button") ?? [])].map(
    (b) => b.textContent?.trim() ?? "",
  );
}

describe("the feed row's triage buttons", () => {
  it("leads with the primary, as the desktop pane and the a/s/d keys do", () => {
    render(
      <FeedCard
        item={item}
        roleLabel="Backend"
        focused={false}
        adding={false}
        onAdd={noop}
        onDismiss={noop}
        onToggleSave={noop}
        onSelect={noop}
        matched={null}
        band={null}
        bandCount={0}
      />,
    );
    const labels = actionLabels();
    expect(labels.length, "the triage row did not render three buttons").toBe(3);
    expect(labels[0], "the primary is not first").toMatch(/add/i);
    expect(labels[1], "keep-for-later is not second").toMatch(/keep|save/i);
    expect(labels[2], "dismiss is not last").toMatch(/dismiss/i);
  });

  it("still offers all three doors", () => {
    // Without this the order test would pass on a row that had lost one —
    // dropping Keep entirely would leave Add first and Dismiss last.
    render(
      <FeedCard
        item={item}
        roleLabel="Backend"
        focused={false}
        adding={false}
        onAdd={noop}
        onDismiss={noop}
        onToggleSave={noop}
        onSelect={noop}
        matched={null}
        band={null}
        bandCount={0}
      />,
    );
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(3);
  });
});
