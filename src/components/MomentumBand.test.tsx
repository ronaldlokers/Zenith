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

describe("the week with nothing in it", () => {
  // A hero-sized zero is emphasis spent on nothing, and it argues with the
  // history bars beside it, which still read as activity at a glance. The
  // quiet register drops the verdict to the muted sentence the app already
  // uses elsewhere and lets the sparkline carry the history alone.
  //
  // The bars are deliberately still passed and still rendered: the history is
  // the part that is true. Only the headline stops claiming a figure.
  test("renders the verdict in the muted register, keeping the history", () => {
    const { container } = render(
      <MomentumBand
        eyebrow="Applications sent"
        verdict="Nothing sent yet this week"
        detail="vs 3 last week"
        quiet
        bars={[{ heightPct: 60, dim: false }, { heightPct: 4, dim: true }]}
      />,
    );
    expect(container.querySelector(".zui-momentumband-verdict")).toHaveClass("quiet");
    expect(container.querySelectorAll(".zui-momentumband-spark i")).toHaveLength(2);
  });

  test("a week with a count keeps the figure register", () => {
    // The other direction. Without this, a change that made every verdict
    // quiet would satisfy the test above.
    const { container } = render(
      <MomentumBand
        eyebrow="Applications sent"
        verdict="4 sent"
        detail="vs 3 last week"
        bars={[{ heightPct: 60, dim: false }]}
      />,
    );
    expect(container.querySelector(".zui-momentumband-verdict")).not.toHaveClass("quiet");
  });
});
