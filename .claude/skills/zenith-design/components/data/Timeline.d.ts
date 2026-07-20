import * as React from "react";

/** A single timeline entry. */
export interface TimelineItem {
  title: React.ReactNode;
  /** Right-aligned timestamp. */
  time?: React.ReactNode;
  description?: React.ReactNode;
  /** Semantic dot color — NOT a pipeline stage. */
  tone?: "default" | "accent" | "success" | "info" | "warning" | "danger";
  /** Tiny glyph inside the node. */
  icon?: React.ReactNode;
}

/**
 * Zenith timeline — vertical activity/event thread (the Detail screen). A rail
 * with tone-colored nodes. Events are not pipeline stages, so tones come from
 * the semantic/neutral palette, never the --st-* ramp.
 */
export interface TimelineProps extends React.OlHTMLAttributes<HTMLOListElement> {
  items: TimelineItem[];
}

export function Timeline(props: TimelineProps): React.JSX.Element;
