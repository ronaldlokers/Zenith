import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import "./LoadFailed.css";

// Terminal error state for a tab whose data fetch failed (#261). Without it, a
// failed load left the "Loading…" placeholder up forever while the only signal
// was the easy-to-miss top banner.
//
// Extracted from the app's own .load-error recipe (App.css:1901), previously
// src/ui.tsx. LoadFailed.css fully describes it rather than depending on
// App.css, which Storybook never loads.
export interface LoadFailedProps extends HTMLAttributes<HTMLDivElement> {
  /** Shows a retry control when given; the caption stands alone without it. */
  onRetry?: () => void;
}

export function LoadFailed({ onRetry, className, ...rest }: LoadFailedProps) {
  const { t } = useTranslation();
  const classes = ["zui-loadfailed", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="alert" {...rest}>
      <p className="zui-loadfailed-text">{t("common.loadError")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
