import * as React from "react";

/**
 * Zenith app sidebar — the fixed 210px Night navigation rail used across every
 * product surface. Put NavItem rows (wrapped in your own <nav>) and optional
 * blocks (onboarding, user card) as children; `footer` renders a muted mono
 * strip pinned to the bottom.
 */
export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Wordmark in the header. Defaults to "Zenith". */
  brand?: string;
  /** Logo image URL shown before the wordmark. */
  logoSrc?: string;
  /** Muted mono footer content pinned to the bottom. */
  footer?: React.ReactNode;
}

export function Sidebar(props: SidebarProps): React.JSX.Element;

export interface NavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Row label. */
  label: string;
  /** SVG path string (24×24 viewBox, stroked with currentColor). */
  icon?: string;
  /** Gold-tinted selected state. */
  active?: boolean;
}

export function NavItem(props: NavItemProps): React.JSX.Element;
