import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { BottomBar, TopBar } from "./shell";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";

// The wordmark is the only navigation in the chrome (#535 shell), so the
// mark's size is load-bearing rather than decorative: it carries three rungs
// and a peak-star, and below about 22px they collapse into a smudge. It
// shipped at exactly that floor. Pinned here because a mark that is slightly
// too small still looks like a logo — nothing about the page looks broken.
describe("top bar", () => {
  function renderTop() {
    const { container } = render(
      <TopBar
        scrolled={false}
        pageTitle="Pipeline"
        settingsActive={false}
        onOpenSettings={() => {}}
        onOpenMenu={() => {}}
        onOpenBoard={() => {}}
      />,
    );
    return container;
  }

  test("renders the mark above the size it turns to mush at", () => {
    const container = renderTop();
    // The mark is the first svg inside the wordmark button; the corner icons
    // live outside it and are a different size on purpose.
    const mark = container.querySelector(".top-brand svg");
    expect(mark?.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(Number(mark?.getAttribute("width"))).toBeGreaterThanOrEqual(25);
  });

  test("moves focus to the heading when the page changes, but not on load", () => {
    // Every destination lives behind the menu, so navigating always happens
    // through a control that unmounts — leaving focus on <body>, where a
    // screen reader announces nothing and the next Tab restarts from the top
    // of the document. Focusing the heading says where you are.
    const { rerender, container } = render(
      <TopBar
        scrolled={false}
        pageTitle="Today"
        settingsActive={false}
        onOpenSettings={() => {}}
        onOpenMenu={() => {}}
        onOpenBoard={() => {}}
      />,
    );
    const h1 = container.querySelector("h1")!;
    // Nobody navigated yet: stealing focus here moves a reader off the page
    // it just started reading.
    expect(document.activeElement).not.toBe(h1);

    rerender(
      <TopBar
        scrolled={false}
        pageTitle="Pipeline"
        settingsActive={false}
        onOpenSettings={() => {}}
        onOpenMenu={() => {}}
        onOpenBoard={() => {}}
      />,
    );
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute("tabindex")).toBe("-1");
  });

  test("the wordmark is a button that opens the menu, not a link home", () => {
    // Every destination lives behind it, which is the whole reason the rail
    // could go away.
    const container = renderTop();
    const brand = container.querySelector(".top-brand");
    expect(brand?.tagName).toBe("BUTTON");
    expect(brand?.getAttribute("aria-haspopup")).toBe("menu");
  });
});

// The bottom bar's slots took their accessible name from the label and the
// keycap inside them, and both are display: none below 700px — which removes
// them from the accessibility tree as well as from the page. Measured with
// axe at 390px: two slots with no accessible name at all, announcing as
// "button". It only ever showed at mobile width, which is why enumerating the
// bar at 1440 kept saying it was fine.
describe("bottom bar", () => {
  function renderBottom() {
    // NotificationBell lives in the third slot and navigates, so the bar
    // needs a router even though nothing here routes.
    return render(
      <MemoryRouter>
        <BottomBar onSearch={() => {}} onPinned={() => {}} pinnedCount={3} />
      </MemoryRouter>,
    );
  }

  test("names its controls without depending on what CSS shows", () => {
    const { getByRole } = renderBottom();
    // getByRole with a name is the assertion that matters: it resolves the
    // accessible name the same way a screen reader does, so a name that only
    // exists in a visually-hidden-at-this-width span does not satisfy it.
    expect(getByRole("button", { name: "Pinned" })).toBeTruthy();
    expect(getByRole("button", { name: "Search" })).toBeTruthy();
  });

  test("keeps the visible label inside the accessible name", () => {
    // WCAG 2.5.3: where the label is shown, the accessible name has to
    // contain it, or voice control cannot address the control by what it
    // says. The aria-label is the visible string exactly.
    const { getByRole } = renderBottom();
    const pinned = getByRole("button", { name: "Pinned" });
    const visible = pinned.querySelector(".bottombar-label")?.textContent ?? "";
    expect(
      pinned.getAttribute("aria-label")?.toLowerCase(),
    ).toContain(visible.toLowerCase());
  });
});
