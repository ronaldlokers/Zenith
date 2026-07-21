import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./FilterTab.css";

// Extracted from the app's board archived-filter tab (.archived-tabs .chip,
// App.css:4938). Self-contained; the "chip" here is a filter tab pill with a
// trailing count, distinct from the keyword Chip component elsewhere.
export interface FilterTabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether this tab is the active/selected filter. */
  active?: boolean;
  /** Optional trailing count, rendered in its own tabular-nums span. */
  count?: ReactNode;
  children: ReactNode;
}

export function FilterTab({
  active = false,
  count,
  type = "button",
  className,
  children,
  ...rest
}: FilterTabProps) {
  const classes = [
    "zui-filtertab",
    active ? "zui-filtertab--active" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
      {count != null && (
        <>
          {" "}
          <span className="zui-filtertab-n">{count}</span>
        </>
      )}
    </button>
  );
}
