import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, test, beforeEach, vi } from "vitest";
import { useNotificationNavigation } from "./hooks";

// A notification's url comes from the push payload. That payload is this
// app's own and Web Push is encrypted end to end, so this is not a known
// exploit — but it is server-supplied input reaching a navigation call, and
// a message handler cannot assume who sent it.
//
// The realistic route to trouble is a misconfiguration rather than an
// attacker: a notification built with a full origin in it — a preview
// deployment's, say — would silently take people off this instance when
// they tapped it. The service worker makes the same check before
// openWindow(); this is the second door.
const listeners: ((e: MessageEvent) => void)[] = [];

beforeEach(() => {
  listeners.length = 0;
  vi.stubGlobal("navigator", {
    ...navigator,
    serviceWorker: {
      addEventListener: (_: string, fn: (e: MessageEvent) => void) =>
        listeners.push(fn),
      removeEventListener: () => {},
    },
  });
});

function Probe() {
  useNotificationNavigation();
  const location = useLocation();
  return <span data-testid="path">{location.pathname + location.search}</span>;
}

function tap(url: unknown) {
  // Each call is its own app instance; without this the second render in a
  // test leaves the first mounted and the query matches both.
  cleanup();
  const { getByTestId } = render(
    <MemoryRouter initialEntries={["/"]}>
      <Probe />
    </MemoryRouter>,
  );
  // act(), or React has not flushed the navigation before the assertion
  // reads the location — which makes every "refuses" case pass for the
  // wrong reason, since a navigation that never happened also leaves the
  // path at "/". The positive case is what exposes that.
  act(() => {
    for (const fn of listeners) {
      fn({ data: { type: "notification-navigate", url } } as MessageEvent);
    }
  });
  return getByTestId("path").textContent;
}

describe("notification navigation", () => {
  test("follows a path within the app", () => {
    expect(tap("/board/9007")).toBe("/board/9007");
    expect(tap("/insights?s=funnel")).toBe("/insights?s=funnel");
  });

  test("refuses to leave the origin", () => {
    // Falls back to the root rather than doing nothing: the tap should still
    // open the app, which is what the person meant by it.
    expect(tap("https://elsewhere.example/phish")).toBe("/");
  });

  test("refuses a protocol-relative url", () => {
    // The classic bypass — "//host/path" is absolute, and a check that only
    // looked for a leading "/" would wave it straight through.
    expect(tap("//elsewhere.example/phish")).toBe("/");
  });

  test("refuses a non-http scheme", () => {
    expect(tap("javascript:alert(1)")).toBe("/");
  });

  test("keeps anything it does follow on this origin", () => {
    expect(tap("")).toBe("/");
    // Garbage that still parses as a relative path is left alone on
    // purpose. It resolves under this origin, so the worst it can do is
    // land on the SPA's catch-all — the guard here is about origin, not
    // about whether a path is tidy.
    expect(tap(":::not a url:::")?.startsWith("/")).toBe(true);
    expect(tap(":::not a url:::")).not.toMatch(/^https?:|^\/\//);
  });
});
