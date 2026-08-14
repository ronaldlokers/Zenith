import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import "./Skeleton.css";

// Extracted from the app's own loading placeholder (.skeleton-list /
// .skeleton-card, App.css:1878/1916), previously src/ui.tsx's
// LoadingSkeleton. Skeleton.css fully describes the recipe rather than
// depending on App.css, which Storybook never loads.
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** How many placeholder cards to stack. Default 3, the app's own count. */
  count?: number;
}

export function Skeleton({ count = 3, className, ...rest }: SkeletonProps) {
  const { t } = useTranslation();
  const classes = ["zui-skeleton", className].filter(Boolean).join(" ");
  return (
    <>
      {/* The boxes stay aria-hidden — they are decoration, and reading three
          empty cards aloud is worse than silence. But silence was all there
          was: every page load and every lazily-loaded tab presented an empty
          page with nothing to say content was coming, and then the content
          arrived unannounced.
          aria-busy is the obvious reach and the wrong one on its own — few
          screen readers act on it. A polite status beside the decoration is
          what actually gets spoken, and it is the pattern the toast stack in
          shell.tsx already uses. */}
      <span className="sr-only" role="status">
        {t("common.loading")}
      </span>
      <div className={classes} aria-hidden="true" {...rest}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="zui-skeleton-card" />
        ))}
      </div>
    </>
  );
}
