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
// `background`, `overflow`, `gap` and `margin`, and the button's own
// resting `background` (transparent here, letting the container's fill show
// through, vs opaque `--surface` there). Those differences are load-bearing —
// don't re-open the merge question over them.
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
   * Omit where the caller renders no tabpanel — the network view does not —
   * so this component skips aria-controls rather than point it at nothing.
   * That's this component's own choice, not a family rule: TabBar's call
   * site (src/detail.tsx) renders only the active tab's panel yet still
   * emits aria-controls for all three tabs, so two of them point at ids that
   * don't exist on every render. Both are faithful copies of the markup they
   * replaced, so neither is a regression — just don't take TabBar's aria-
   * controls wiring as a pattern to extend.
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
  return (
    <div className="zui-pilltabs" role="tablist" aria-label={rest["aria-label"]}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${key}` : undefined}
          aria-selected={active === key}
          aria-controls={idPrefix ? `${idPrefix}-panel-${key}` : undefined}
          className={active === key ? "active" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
