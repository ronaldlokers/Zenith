import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Application, Status } from "./types";
import { PipelineTab } from "./board";
import i18n from "./i18n";
import nl from "./locales/nl.json";
import { daysFromToday } from "./format";

// The read-only star rating announced itself in hardcoded English. Its
// fallback was a literal `${value} of ${max}`, and both call sites that render
// it read-only — the board card and the dashboard's "Next up" row — passed no
// aria-label. So a Dutch screen-reader user heard "4 of 5" in English on every
// card carrying a fit score, and the string's real language never matched the
// document's (WCAG 3.1.2).
//
// StarRating is design-system-owned and deliberately knows nothing about
// i18next — Storybook loads no app context — so the label has to come from the
// caller. The English fallback is deleted rather than translated: a component
// that cannot translate should not pretend to. TypeScript now requires the
// label on the read-only variant, which is what stops the next call site
// arriving with the same defect.
//
// This renders the real board rather than the component in isolation, because
// the component was never the thing that was wrong.
vi.mock("./api", () => ({
  api: {
    profile: () => Promise.resolve({ board_folded: null }),
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

function app(fit: number | null): Application {
  return {
    id: 1,
    company_id: null,
    company_name: "Northwind",
    contact_id: null,
    title: "Role 1",
    role_type: "platform-engineer",
    url: null,
    source: null,
    salary_range: null,
    salary_currency: null,
    salary_min: null,
    salary_max: null,
    salary_period: null,
    signing_bonus: null,
    bonus_target_pct: null,
    equity_value: null,
    benefits_notes: null,
    referred_by_contact_id: null,
    posting_status: null,
    posting_checked_at: null,
    status: "applied" as Status,
    notes: null,
    applied_at: daysFromToday(-10),
    next_action: null,
    next_action_at: null,
    deadline_at: null,
    archived_at: null,
    pinned_at: null,
    fit_score: fit,
    cover_letter: null,
    job_description: null,
    job_description_captured_at: null,
    tags: [],
    created_at: daysFromToday(-10),
    updated_at: daysFromToday(-1),
  } as Application;
}

// Only English is bundled with the app; every other locale is fetched at
// runtime (src/i18n.ts), and nothing fetches in jsdom. Registering nl here is
// what makes "does the Dutch reader hear Dutch" a question this test can ask
// at all.
i18n.addResourceBundle("nl", "translation", nl, true, true);

async function boardIn(lang: string, fit: number | null) {
  await i18n.changeLanguage(lang);
  render(
    <MemoryRouter initialEntries={["/board"]}>
      <PipelineTab
        applications={[app(fit)]}
        companies={[]}
        roleTypes={[]}
        onChanged={() => Promise.resolve()}
        onError={() => {}}
        notify={() => {}}
        onStatus={() => {}}
        lastInteractions={[]}
        history={[]}
        onOpenJob={() => {}}
        focusCardId={null}
        onOpenQuickAdd={() => {}}
        onOpenSampleData={() => {}}
      />
    </MemoryRouter>,
  );
  return waitFor(() => screen.getByRole("img"));
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("a board card's fit score", () => {
  test("announces itself in Dutch to a Dutch reader", async () => {
    const rating = await boardIn("nl", 4);
    expect(
      rating.getAttribute("aria-label"),
      "the Dutch board still announces the fit score in English",
    ).toBe("Fit-score 4 van 5");
  });

  test("says the same thing in English", async () => {
    const rating = await boardIn("en", 4);
    expect(rating.getAttribute("aria-label")).toBe("Fit score 4 of 5");
  });
});
