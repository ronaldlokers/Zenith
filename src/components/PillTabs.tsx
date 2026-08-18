import { useRef } from "react";
import { tablistKeyDown } from "./tablist-keys";
import "./PillTabs.css";

// The network subnav's pill tablist (App.css:1007): a bordered capsule whose
// active tab is a filled accent pill, as against TabBar's underline.
//
// This is the same SHAPE as SegmentedControl — same border, same radius-full,
// same filled-accent active state. It used to differ in voice too — body text
// here, mono uppercase there — but that was type-ramp drift, not a decision;
// DESIGN.md's Mono-Is-Chrome Rule names tab labels as exactly the mono case,
// and the voice now matches (#501 follow-up). What still keeps the two
// components apart is structural, not typographic: the container's
// `background`, `overflow` and `gap`, and the button's own resting
// `background` (transparent here, letting the container's fill show through,
// vs opaque `--surface` there). Those differences are load-bearing — don't
// re-open the merge question over them. `margin` also differs (this
// component's `0.25rem 0 0.9rem` vs SegmentedControl's call sites), but that's
// inherited call-site spacing from `.subnav`, not a design decision — a future
// reader may legitimately move it to the call site.
//
// PillTabs.css fully describes it rather than depending on App.css, which
// Storybook never loads — including the band-5 touch-target minimum, which the
// raw markup inherited from a grouped selector.
export interface PillTabsTab<K extends string> {
  key: K;
  label: string;
}

export interface PillTabsProps<K extends string> {
  tabs: PillTabsTab<K>[];
  active: K;
  onSelect: (key: K) => void;
  /**
   * Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`.
   * Omit where the caller renders no tabpanel, and this skips the id wiring
   * rather than point it at nothing.
   *
   * Both call sites render only the active panel, so only the active tab
   * points at one — the same rule TabBar follows (#517). Every tab keeps its
   * own id regardless, because the panel labels itself with the active tab.
   */
  idPrefix?: string;
  "aria-label": string;
}

export function PillTabs<K extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  ...rest
}: PillTabsProps<K>) {
  const refs = useRef(new Map<K, HTMLElement | null>()).current;
  return (
    <div
      className="zui-pilltabs"
      role="tablist"
      aria-label={rest["aria-label"]}
    >
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${key}` : undefined}
          ref={(el) => {
            refs.set(key, el);
          }}
          aria-selected={active === key}
          aria-controls={
            idPrefix && active === key ? `${idPrefix}-panel-${key}` : undefined
          }
          tabIndex={active === key ? 0 : -1}
          className={active === key ? "active" : undefined}
          onClick={() => onSelect(key)}
          onKeyDown={(e) =>
            tablistKeyDown(e, {
              keys: tabs.map((t) => t.key),
              active,
              onSelect,
              refs,
            })
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
