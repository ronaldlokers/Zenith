import * as React from "react";

/**
 * Zenith avatar. Renders initials on a deterministic neutral tint, or a photo
 * when `src` is given. Neutral palette only — never painted with pipeline stage
 * colors. `AvatarGroup` overlaps a set with a "+N" overflow chip.
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — drives initials and tint. */
  name?: string;
  /** Photo URL; falls back to initials when omitted. */
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /** Gold selection ring. */
  ring?: boolean;
}

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Names or `{name, src}` objects. */
  people?: Array<string | { name: string; src?: string | null }>;
  size?: "sm" | "md" | "lg" | "xl";
  /** Max shown before the "+N" chip. */
  max?: number;
}

export function Avatar(props: AvatarProps): React.JSX.Element;
export function AvatarGroup(props: AvatarGroupProps): React.JSX.Element;
