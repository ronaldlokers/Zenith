import "./PillTabs.css";

// The network subnav's pill tablist (App.css:1083): a bordered capsule whose
// active tab is a filled accent pill, as against TabBar's underline.
//
// This is the same SHAPE as SegmentedControl — same border, same radius-full,
// same filled-accent active state — and differs only in voice: body text here,
// mono uppercase there. That difference is type-ramp drift, not a decision, and
// PR 5 of the Wave 2 plan resolves whether these two components merge. Kept
// separate here so the structural change and the visual one stay reviewable
// apart.
//
// PillTabs.css fully describes it rather than depending on App.css, which
// Storybook never loads — including the band-5 touch-target minimum, which the
// raw markup inherited from a grouped selector.
export interface PillTabsTab {
  key: string;
  label: string;
}

export interface PillTabsProps {
  tabs: PillTabsTab[];
  active: string;
  onSelect: (key: string) => void;
  /**
   * Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`.
   * Omit where the caller renders no tabpanel — the network view does not,
   * and an aria-controls pointing at an id that does not exist is worse than
   * no association at all.
   */
  idPrefix?: string;
  "aria-label": string;
}

export function PillTabs({ tabs, active, onSelect, idPrefix, ...rest }: PillTabsProps) {
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
