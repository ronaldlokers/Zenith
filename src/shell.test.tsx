import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TopBar } from "./shell";
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

  test("the wordmark is a button that opens the menu, not a link home", () => {
    // Every destination lives behind it, which is the whole reason the rail
    // could go away.
    const container = renderTop();
    const brand = container.querySelector(".top-brand");
    expect(brand?.tagName).toBe("BUTTON");
    expect(brand?.getAttribute("aria-haspopup")).toBe("menu");
  });
});
