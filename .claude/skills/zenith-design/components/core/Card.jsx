import React from "react";

// Surface card. White surface, hairline border, 14px (lg) corner, soft
// level-1 elevation. No gradients — restrained. Stage-tagged rows may add a
// 3px stage-colored left border at the call site.
export function Card({ interactive = false, children, style = {}, ...rest }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-4)",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
