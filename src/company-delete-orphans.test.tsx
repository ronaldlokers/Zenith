import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useAppData } from "./app-data";
import "./i18n";
import { CompanyDetailModal } from "./companies";
import type { Application, Company, Contact } from "./types";

// Deleting a company sets company_id to NULL on every application pointing at
// it (0001_init's ON DELETE SET NULL). The delete used the generic
// "Deleted X" toast, so someone tidying up a duplicate had no count in front
// of them and, once the six-second undo passed, nothing recording what those
// applications had been attached to.
//
// The count has to be stated while undo is still on screen — that is the only
// moment it is actionable.
const company = { id: 7, name: "Acme" } as Company;

const app = (over: Partial<Application>): Application =>
  ({ id: 1, title: "Role", status: "applied", ...over }) as Application;

function open(applications: Application[]) {
  const onDelete = vi.fn();
  render(
    <CompanyDetailModal
      company={company}
      contacts={[] as Contact[]}
      applications={applications}
      onClose={() => {}}
      onChanged={async () => {}}
      onError={() => {}}
      notify={() => {}}
      onDelete={onDelete}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  return onDelete;
}

describe("deleting a company that applications point at", () => {
  test("says how many lose their link", () => {
    const onDelete = open([
      app({ id: 1, company_id: 7 }),
      app({ id: 2, company_id: 7 }),
      app({ id: 3, company_id: 99 }),
    ]);
    const message = onDelete.mock.calls[0]?.[3] as string | undefined;
    // Two, not three — the third belongs to another company and is unaffected.
    expect(message, "the toast does not name the affected applications").toMatch(/\b2\b/);
    expect(message).toMatch(/company link/i);
  });

  test("says nothing extra when nothing is affected", () => {
    // The generic toast is right here, and a "0 applications" clause would be
    // noise on the common case of deleting something nothing referenced.
    const onDelete = open([app({ id: 3, company_id: 99 })]);
    expect(onDelete.mock.calls[0]?.[3]).toBeUndefined();
  });

  test("counts one in the singular", () => {
    const message = open([app({ id: 1, company_id: 7 })]).mock.calls[0]?.[3] as string;
    expect(message).toMatch(/1 application will lose its company link/);
  });
});

// The other half of the path. The test above asserts what the delete button
// hands to onDelete; nothing yet asserted that deleteWithUndo actually shows
// it — drop the override there and the count is composed, passed, and then
// silently replaced by the generic toast.
vi.mock("./api", () => ({
  api: {
    list: () => Promise.resolve([]),
    roleTypes: () => Promise.resolve([]),
    stats: () => Promise.resolve({ history: [], interactions: [] }),
    goals: () => Promise.resolve(null),
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    profile: () => Promise.resolve({}),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
    remove: () => Promise.resolve(undefined),
  },
}));

describe("the toast deleteWithUndo actually raises", () => {
  const navigate = (() => {}) as never;
  const translate = ((k: string) => k) as never;

  test("is the caller's message when one is given", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useAppData(notify, navigate, translate));
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.deleteWithUndo("companies", 7, "Acme", "2 applications will lose their company link");
    expect(notify.mock.calls[0]?.[0]).toBe("2 applications will lose their company link");
  });

  test("falls back to the generic one when none is", async () => {
    // Deleting anything else must not start demanding a message.
    const notify = vi.fn();
    const { result } = renderHook(() => useAppData(notify, navigate, translate));
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.deleteWithUndo("contacts", 3, "Sam");
    expect(notify.mock.calls[0]?.[0]).toBe("toast.deleted");
  });
});
