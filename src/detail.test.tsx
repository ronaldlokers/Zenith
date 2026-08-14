import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { Application, Status } from "./types";
import { ApplicationDetailModal } from "./detail";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";
import { daysFromToday } from "./format";

// The detail page's shape is load-bearing (#535 shell): the tools hang
// against the plate, which only works while they are its *siblings*. Nesting
// them inside it renders plausibly and wrong — the same missing-`</div>` bug
// hit the prototype twice — so the relationship is asserted rather than
// eyeballed. Whether their tops line up is a layout question jsdom cannot
// answer; that one is checked against the live render.
vi.mock("./api", () => ({
  api: {
    // The page mounts several sections that each fetch on mount; none of
    // them matter to the shape being asserted here.
    list: () => Promise.resolve([]),
    interactions: () => Promise.resolve([]),
    patchApplication: () => Promise.resolve(undefined),
  },
}));

// Dates come from the app's own daysFromToday(), not from
// toISOString().slice(0, 10). The two disagree for anyone east of UTC
// between local midnight and UTC midnight: toISOString() yields the UTC
// date, so a fixture meant to be "today" arrives as yesterday and the app —
// which computes today() from local parts — reads it as overdue. CI runs in
// UTC where the two agree, so this was green there and red on a developer's
// machine at night, which is the worst shape a flake can take.
// daysFromToday also uses setDate rather than adding 86400000, so it stays
// correct across a DST transition where a local day is 23 or 25 hours.
const iso = (d: number) =>
  daysFromToday(d);

const app: Application = {
  id: 1,
  company_id: null,
  company_name: "Northwind Cloud",
  contact_id: null,
  contact_name: "Mira Doyle",
  title: "Senior Platform Engineer",
  role_type: "platform-engineer",
  url: "https://example.com/job",
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
  status: "interview" as Status,
  notes: null,
  applied_at: iso(-30),
  next_action: null,
  next_action_at: null,
  deadline_at: null,
  archived_at: null,
  pinned_at: null,
  fit_score: null,
  cover_letter: null,
  job_description: null,
  job_description_captured_at: null,
  tags: [],
  created_at: iso(-30),
  updated_at: iso(-1),
};

function renderDetail(over: Partial<Application> = {}) {
  const { container } = render(
    <MemoryRouter>
      <ApplicationDetailModal
        application={{ ...app, ...over }}
        allApplications={[]}
        companies={[]}
        contacts={[]}
        roleTypes={[{ id: 1, slug: "platform-engineer", label: "Platform Engineer", sort_order: 0 }]}
        onClose={() => {}}
        onChanged={() => Promise.resolve()}
        onError={() => {}}
        notify={() => {}}
        onDelete={() => {}}
        onStatus={() => {}}
      />
    </MemoryRouter>,
  );
  return container;
}

describe("detail page structure", () => {
  test("the tool rails are siblings of the plate, not inside it", () => {
    const container = renderDetail();
    const plate = container.querySelector(".detail-plate")!;
    const tools = [...container.querySelectorAll(".detail-tools")];
    expect(plate).toBeTruthy();
    expect(tools).toHaveLength(2);
    for (const rail of tools) {
      expect(rail.parentElement).toBe(plate.parentElement);
      expect(plate.contains(rail)).toBe(false);
    }
  });

  test("the plate carries the current stage, so its wash follows the pipeline", () => {
    const container = renderDetail({ status: "offer" });
    expect(container.querySelector(".detail-stage")?.className).toContain(
      "stage-offer",
    );
  });

  test("the actions are on the plate and the card is not their parent", () => {
    const container = renderDetail();
    const actions = container.querySelector(".detail-plate-actions")!;
    const card = container.querySelector(".detail-card")!;
    expect(actions.parentElement).toBe(container.querySelector(".detail-plate"));
    expect(card.contains(actions)).toBe(false);
  });

  test("every stage is on the rail, with the current one marked", () => {
    const container = renderDetail();
    // Buttons, not radios: each one performs a move, and a radio group's
    // arrows would select as they move — writing a stage change per keypress.
    const steps = [
      ...container.querySelectorAll<HTMLElement>(".detail-rail button"),
    ];
    expect(steps).toHaveLength(8);
    const pressed = steps.filter((s) => s.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe("Interview");
  });
});
