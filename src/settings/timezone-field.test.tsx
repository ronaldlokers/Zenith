import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TimezoneField } from "./timezone-field";
// Side-effect: initializes i18next so `t()` renders real copy instead of raw
// keys (same convention as CardMenu.test.tsx, the first owned-component test
// to need it).
import "../i18n";

// A negative-offset zone is what makes a UTC-vs-local mistake observable; CI
// runs in UTC, where several of these assertions would pass regardless.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T03:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = ORIGINAL_TZ;
});

describe("timezone pin guard", () => {
  // Without this, a silently-failing pin turns every assertion below into one
  // that passes while checking nothing.
  it("fails loudly if the America/Los_Angeles pin stops applying", () => {
    expect(new Date("2026-08-05T03:00:00Z").getDate()).toBe(4);
  });
});

describe("TimezoneField", () => {
  it("shows the stored zone as the selected value", () => {
    render(<TimezoneField value="Europe/Amsterdam" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("Europe/Amsterdam");
  });

  // The hint is what makes the setting verifiable; showing the browser's time
  // instead of the selected zone's would make it actively misleading.
  it("shows the current time in the selected zone, not the browser's", () => {
    render(<TimezoneField value="Europe/Amsterdam" onChange={() => {}} />);
    // 2026-08-05T03:00:00Z is 05:00 in Amsterdam and 20:00 in Los Angeles.
    // Exact text, not a /05:00/ substring match: that regex matches "05:00"
    // and "05:00 AM" equally, so it passed against a 12-hour render too — the
    // bug that shipped as "02:00 PM" instead of "14:00" under en. Assert the
    // whole string so an AM/PM suffix fails it.
    expect(screen.getByText("05:00 right now")).toBeInTheDocument();
    expect(screen.queryByText(/20:00/)).not.toBeInTheDocument();
  });

  it("reports the chosen zone", () => {
    const onChange = vi.fn();
    render(<TimezoneField value="Europe/Amsterdam" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "America/New_York" },
    });
    expect(onChange).toHaveBeenCalledWith("America/New_York");
  });

  it("groups options by region", () => {
    const { container } = render(
      <TimezoneField value="Europe/Amsterdam" onChange={() => {}} />,
    );
    const labels = [...container.querySelectorAll("optgroup")].map((g) =>
      g.getAttribute("label"),
    );
    expect(labels).toContain("Europe");
    expect(labels).toContain("America");
  });

  // UTC is not in Intl.supportedValuesOf. Without injecting it, opening
  // Settings would silently reset a working zone to whatever sorts first.
  it("keeps a stored zone that is absent from the supported list", () => {
    render(<TimezoneField value="UTC" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("UTC");
  });
});
