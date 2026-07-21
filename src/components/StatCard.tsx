import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import "./StatCard.css";

// Ported from the design system (components/core/StatCard.jsx), but reshaped to
// the app's actual KPI tile (.dash-kpi): a mono figure over a muted label, not
// the DS eyebrow/value/delta layout. StatCard.css fully describes it — it
// reproduces the App.css .dash-kpi recipe rather than depending on it, because
// Storybook loads no App.css. The DS delta/trend/accent/icon props are omitted
// (no call site uses them); add them when a metric actually needs one.
export interface StatCardProps
  extends Omit<HTMLAttributes<HTMLElement>, "onClick"> {
  /** The primary figure (mono, tabular). */
  value: ReactNode;
  /** Muted caption under the figure. */
  label: ReactNode;
  /**
   * When provided the tile renders as an interactive <button> with the hover
   * lift; otherwise it is a static <div>. Mirrors the dashboard, where three
   * KPIs navigate on click and one (time-to-offer) is read-only.
   */
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function StatCard({
  value,
  label,
  onClick,
  className,
  ...rest
}: StatCardProps) {
  const classes = [
    "zui-statcard",
    onClick ? "zui-statcard--click" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span className="zui-statcard-value">{value}</span>
      <span className="zui-statcard-label">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} {...rest}>
      {body}
    </button>
  ) : (
    <div className={classes} {...rest}>
      {body}
    </div>
  );
}
