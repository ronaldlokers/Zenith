import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import "./DashCard.css";

// Extracted from the app's own dashboard content card (.dash-card): a surface
// panel with an optional eyebrow heading (+ a "win" pill) over arbitrary body
// content. Not a design-system port — this is the site's own pattern made into
// a component. DashCard.css fully describes it (reproduces the App.css .dash-card
// recipe), so it renders identically in the app and standalone in Storybook.
export interface DashCardProps
  extends Omit<HTMLAttributes<HTMLElement>, "onClick"> {
  /** The .dash-ch eyebrow label. Omitted for the lead card, which has none. */
  heading?: ReactNode;
  /** Optional right-aligned "win" pill in the heading (.dash-win). */
  win?: ReactNode;
  /** Accent left border (the dashboard's lead card). */
  lead?: boolean;
  /**
   * When present the panel is an interactive <button> with the hover lift;
   * otherwise a static <div>. Mirrors the dashboard, where only the funnel
   * card navigates on click.
   */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}

export function DashCard({
  heading,
  win,
  lead = false,
  onClick,
  className,
  children,
  ...rest
}: DashCardProps) {
  const classes = [
    "zui-dashcard",
    lead ? "zui-dashcard--lead" : null,
    onClick ? "zui-dashcard--click" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const head =
    heading != null ? (
      <div className="zui-dashcard-head">
        {heading}
        {win != null && <span className="zui-dashcard-win">{win}</span>}
      </div>
    ) : null;
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} {...rest}>
      {head}
      {children}
    </button>
  ) : (
    <div className={classes} {...rest}>
      {head}
      {children}
    </div>
  );
}
