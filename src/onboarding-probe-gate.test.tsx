import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Application, Company } from "./types";
import App from "./App";
import "./i18n";

// Card 154: onboardingComplete only ever hid the checklist. It never set the
// same "zenith_onboarding_dismissed" flag an explicit Dismiss does, so an
// account that finishes onboarding by using the app — never pressing
// Dismiss — kept paying for api.profile/api.feedConfig/api.goals on every
// load, forever.
const DISMISS_KEY = "zenith_onboarding_dismissed";
const calls: string[] = [];
const count = (name: string) => calls.filter((c) => c === name).length;

// Mutable per-test knobs, read live by the mocked api below — same shape as
// goal-single-fetch.test.tsx's `calls` pattern.
let profileResult: () => Promise<{
  name?: string | null;
  email?: string | null;
}> = () => Promise.resolve({ name: "Ada Lovelace", email: "ada@example.com" });
let feedKeywords: { id: number; role_slug: string; keyword: string }[] = [
  { id: 1, role_slug: "platform-engineer", keyword: "kubernetes" },
];

vi.mock("./auth-client", () => ({
  useSession: () => ({ data: { user: { role: "user" } } }),
}));

const company: Company = {
  id: 1,
  name: "Northwind",
  website: null,
  location: null,
  is_agency: 0,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

function application(): Application {
  return {
    id: 1,
    company_id: 1,
    contact_id: null,
    title: "Staff Engineer",
    role_type: "platform-engineer",
    status: "applied",
    next_action: null,
    next_action_at: null,
    archived_at: null,
    pinned_at: null,
    fit_score: null,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Application;
}

vi.mock("./api", () => ({
  api: {
    list: (resource: string) => {
      calls.push(`list:${resource}`);
      if (resource === "applications") return Promise.resolve([application()]);
      if (resource === "companies") return Promise.resolve([company]);
      return Promise.resolve([]);
    },
    roleTypes: () => Promise.resolve([]),
    stats: () =>
      Promise.resolve({ applications: [], history: [], interactions: [] }),
    goals: () => {
      calls.push("goals");
      return Promise.resolve({ search_started_at: null, weekly_app_goal: 5 });
    },
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
    profile: () => {
      calls.push("profile");
      return profileResult();
    },
    feedConfig: () => {
      calls.push("feedConfig");
      return Promise.resolve({ sources: [], keywords: feedKeywords });
    },
    notifications: () => Promise.resolve([]),
  },
}));

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

const checklist = () => document.querySelector(".zui-onboarding");

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  profileResult = () =>
    Promise.resolve({ name: "Ada Lovelace", email: "ada@example.com" });
  feedKeywords = [
    { id: 1, role_slug: "platform-engineer", keyword: "kubernetes" },
  ];
});

afterEach(() => {
  localStorage.clear();
});

describe("the onboarding probe gate", () => {
  test("persists dismissed once onboarding is genuinely complete, so the next load stops probing", async () => {
    renderApp();

    // Sanity: the fixture actually drove the probe, not a vacuous pass.
    expect(count("profile"), "profile probe did not run").toBe(1);
    expect(count("feedConfig"), "feed-config probe did not run").toBe(1);

    await waitFor(() => expect(localStorage.getItem(DISMISS_KEY)).toBe("1"));
    expect(
      checklist(),
      "the account is complete, the checklist should be gone",
    ).toBeNull();

    // A fresh load — same account, same localStorage — must not re-probe.
    calls.length = 0;
    renderApp();
    await waitFor(() => expect(count("list:applications")).toBe(1));
    expect(count("profile"), "profile fetched again after completion").toBe(
      0,
    );
    expect(
      count("feedConfig"),
      "feed-config fetched again after completion",
    ).toBe(0);
    // goals is still fetched once, by useAppData's own weekly-goal read —
    // that call is deliberately untouched by this fix.
    expect(count("goals"), "the weekly-goal read should not disappear too").toBe(
      1,
    );
  });

  test("does not persist while a step is still outstanding", async () => {
    feedKeywords = [];
    renderApp();

    expect(count("feedConfig")).toBe(1);
    await waitFor(() =>
      expect(
        checklist(),
        "an incomplete account should still see the checklist",
      ).not.toBeNull(),
    );
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  test("does not persist off a failed probe", async () => {
    profileResult = () => Promise.reject(new Error("session expired"));
    renderApp();

    expect(count("profile")).toBe(1);
    // allSettled means onboardingChecked flips regardless of the failure —
    // give the checklist a moment to settle before asserting it stayed up.
    await waitFor(() =>
      expect(checklist(), "a failed probe is not evidence of completion").not.toBeNull(),
    );
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });
});
