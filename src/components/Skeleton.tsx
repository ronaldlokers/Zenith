import type { HTMLAttributes } from "react";
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
  const classes = ["zui-skeleton", className].filter(Boolean).join(" ");
  return (
    <div className={classes} aria-hidden="true" {...rest}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="zui-skeleton-card" />
      ))}
    </div>
  );
}
