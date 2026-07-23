import type { KeyboardEvent } from "react";
import "./StarRating.css";

// Extracted from the app's fit-score rating (detail.tsx:661-711, recipe at
// App.css:4182 .fit-edit). Generic accessible star rating — a radiogroup of
// `max` toggleable stars with roving-tabindex arrow/Home/End navigation.
// Self-contained: no App.css class names, so it renders identically in
// Storybook (which loads no App.css) and in the app.
export interface StarRatingProps {
  /** Current rating. `null` means unset. */
  value: number | null;
  /** Number of stars. */
  max?: number;
  /** Caller persists the new value (or `null` to clear it). Not needed when
   *  `readOnly`. */
  onChange?: (next: number | null) => void;
  disabled?: boolean;
  /** Non-interactive display (board/dashboard/detail fit score, #455) — shows
   *  all `max` stars filled to `value`, so it reads consistently everywhere
   *  instead of the old bare "N glyphs" spans. */
  readOnly?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  /** aria-label for star n; defaults to the star's number. */
  starLabel?: (n: number) => string;
}

export function StarRating({
  value,
  max = 5,
  onChange,
  disabled = false,
  readOnly = false,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  starLabel,
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  if (readOnly) {
    return (
      <span
        className="zui-starrating zui-starrating--readonly"
        role="img"
        aria-label={ariaLabel ?? `${value ?? 0} of ${max}`}
      >
        {stars.map((n) => (
          <span
            key={n}
            aria-hidden="true"
            className={`zui-star${(value ?? 0) >= n ? " zui-star--on" : ""}`}
          >
            ★
          </span>
        ))}
      </span>
    );
  }

  const handleKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    // Arrow/Home/End move the rating like a real radiogroup — mirrors the
    // fit-score keyboard behaviour in detail.tsx (#346).
    const cur = value ?? 0;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp")
      next = Math.min(max, (cur || 0) + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
      next = Math.max(1, (cur || 1) - 1);
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = max;
    else return;
    e.preventDefault();
    if (next !== value && !disabled) onChange?.(next);
  };

  return (
    <span
      className="zui-starrating"
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKey}
    >
      {stars.map((n) => {
        const checked = (value ?? 0) === n;
        // Roving tabindex: only the checked star (or the first, when
        // unset) is tabbable; arrows move within the group.
        const tabbable = checked || (!value && n === 1);
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            className={`zui-star${(value ?? 0) >= n ? " zui-star--on" : ""}`}
            aria-label={starLabel?.(n) ?? String(n)}
            onClick={() => onChange?.(value === n ? null : n)}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}
