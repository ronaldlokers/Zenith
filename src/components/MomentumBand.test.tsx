import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MomentumBand } from "./MomentumBand";

const bars = [
  { heightPct: 20, dim: true },
  { heightPct: 80, dim: false },
  { heightPct: 4, dim: true },
];

describe("MomentumBand", () => {
  test("renders eyebrow, verdict, and detail", () => {
    render(
      <MomentumBand
        eyebrow="Momentum"
        verdict="Picking up"
        detail="6 vs 3 last week"
        bars={bars}
      />,
    );
    expect(screen.getByText("Momentum")).toBeInTheDocument();
    expect(screen.getByText("Picking up")).toBeInTheDocument();
    expect(screen.getByText("6 vs 3 last week")).toBeInTheDocument();
  });

  test("renders one spark bar per entry", () => {
    const { container } = render(
      <MomentumBand eyebrow="x" verdict="x" detail="x" bars={bars} />,
    );
    const barEls = container.querySelectorAll(".zui-momentumband-spark > i");
    expect(barEls).toHaveLength(bars.length);
  });

  test("dim bars get the dim class, others don't", () => {
    const { container } = render(
      <MomentumBand eyebrow="x" verdict="x" detail="x" bars={bars} />,
    );
    const barEls = container.querySelectorAll(".zui-momentumband-spark > i");
    expect(barEls[0]).toHaveClass("dim");
    expect(barEls[1]).not.toHaveClass("dim");
    expect(barEls[2]).toHaveClass("dim");
  });

  test("applies each bar's heightPct as inline height", () => {
    const { container } = render(
      <MomentumBand eyebrow="x" verdict="x" detail="x" bars={bars} />,
    );
    const barEls = container.querySelectorAll(".zui-momentumband-spark > i");
    expect((barEls[0] as HTMLElement).style.height).toBe("20%");
    expect((barEls[1] as HTMLElement).style.height).toBe("80%");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy dash-band name", () => {
    const { container } = render(
      <MomentumBand eyebrow="x" verdict="x" detail="x" bars={bars} />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-momentumband");
    const cls = (root?.className ?? "").split(/\s+/);
    expect(cls).not.toContain("dash-band");
  });
});
