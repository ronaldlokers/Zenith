import * as React from "react";

/**
 * Full-screen mobile splash / loading screen: Night gradient field with the
 * ascent-path logo, wordmark, and a rising three-rung loader that echoes the
 * pipeline climb. Use on app cold-start, auth hand-off, or any full-view load.
 * Renders `position:absolute; inset:0`, so mount it inside a positioned
 * container (e.g. the phone frame or app root).
 *
 * @startingPoint section="Zenith" subtitle="Mobile splash / loading screen" viewport="390x844"
 */
export interface SplashScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Brand name shown as the wordmark. Defaults to "Zenith". */
  brand?: string;
  /** Optional line under the wordmark. Pass "" to hide. */
  tagline?: string;
  /** Loading vs settled — drives aria-busy. */
  status?: "loading" | "ready";
  /** Logo image URL. Falls back to the brand initial in a tile when omitted. */
  logoSrc?: string;
}

export function SplashScreen(props: SplashScreenProps): React.JSX.Element;
