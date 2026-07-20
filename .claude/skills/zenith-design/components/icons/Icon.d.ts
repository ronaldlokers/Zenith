import * as React from "react";

/**
 * Zenith line-art icon. 24x24 viewBox, currentColor stroke, strokeWidth 2,
 * rounded caps — icons inherit text color and tint with accent/muted context.
 * No emoji, no icon font: this is the app's single glyph convention.
 */
export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "name"> {
  /** Glyph name — see ICON_NAMES. */
  name?:
    | "overview" | "pipeline" | "feed" | "calendar" | "network" | "cv"
    | "settings" | "search" | "filter" | "archive" | "bell" | "error";
  /** Square px size (default 22). */
  size?: number;
  strokeWidth?: number;
}

export function Icon(props: IconProps): React.JSX.Element;
export const ICON_NAMES: string[];
