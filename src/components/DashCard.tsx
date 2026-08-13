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
  /**
   * Heading level for the card's own title. A real heading, because this
   * card is how the analytics surface is divided up, and it rendered a
   * <div>: a screen-reader user navigating Insights by heading skipped the
   * KPIs, the momentum band, the funnel, the outcomes and the offers, and
   * landed on the calendar. Guidance on accessible dashboards is explicit
   * that every visualisation needs a real heading and that levels must not
   * skip. Defaults to 2; the styling is unchanged either way.
   */
  headingLevel?: 2 | 3;
  /** Optional right-aligned "win" pill in the heading (.dash-win). */
  win?: ReactNode;
  /** Accent left border (the dashboard's lead card). */
  lead?: boolean;
  /**
   * Column variant (#535 shell): the panel drops its own surface and the
   * heading centres over the column, because the content beneath it is a
   * stack of cards rather than one card's body.
   */
  column?: boolean;
  /** Trailing mark in the heading — what kind of figures these are. */
  icon?: ReactNode;
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
  headingLevel = 2,
  win,
  lead = false,
  column = false,
  icon,
  onClick,
  className,
  children,
  ...rest
}: DashCardProps) {
  const classes = [
    "zui-dashcard",
    lead ? "zui-dashcard--lead" : null,
    column ? "zui-dashcard--column" : null,
    onClick ? "zui-dashcard--click" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const HeadTag = `h${headingLevel}` as "h2" | "h3";
  const head =
    heading != null ? (
      <HeadTag className="zui-dashcard-head">
        {heading}
        {win != null && <span className="zui-dashcard-win">{win}</span>}
        {icon != null && <span className="zui-dashcard-icon">{icon}</span>}
      </HeadTag>
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
