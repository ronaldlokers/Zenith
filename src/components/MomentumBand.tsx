import type { ReactNode } from "react";
import "./MomentumBand.css";

// Extracted from the app's dashboard momentum band (dashboard.tsx:114-128 /
// App.css .dash-band:4425): an eyebrow + verdict + muted detail line, beside a
// sparkline of bars. Not a design-system port — this is the site's own
// pattern made into a component. MomentumBand.css fully describes it
// (reproduces the App.css recipe), so it renders identically in the app and
// standalone in Storybook.
export interface MomentumBandProps {
  /** The .dash-eyebrow label. */
  eyebrow: ReactNode;
  /** The .dash-band-verdict headline. */
  verdict: ReactNode;
  /** The muted detail line (App.css .muted + .small). */
  detail: ReactNode;
  /** Sparkline bars; caller computes each bar's height. */
  bars: { heightPct: number; dim: boolean }[];
  /**
   * Drops the verdict out of the figure register into the muted sentence one.
   * For the week that has nothing to headline: a hero-sized zero is emphasis
   * spent on nothing, and it argues with the history bars beside it, which
   * still read as activity. The sparkline carries the history on its own.
   */
  quiet?: boolean;
}

export function MomentumBand({
  eyebrow,
  verdict,
  detail,
  bars,
  quiet = false,
}: MomentumBandProps) {
  return (
    <div className="zui-momentumband">
      <div>
        <span className="zui-momentumband-eyebrow">{eyebrow}</span>
          <div className={`zui-momentumband-verdict${quiet ? " quiet" : ""}`}>
          {verdict}
        </div>
        <div className="zui-momentumband-detail">{detail}</div>
      </div>
      <div className="zui-momentumband-spark" aria-hidden="true">
        {bars.map((b, i) => (
          <i
            key={i}
            style={{ height: `${b.heightPct}%` }}
            className={b.dim ? "dim" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
