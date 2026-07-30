import "./TabBar.css";

// The underline tab bar from the application detail view (App.css:3989):
// a hairline-bottomed row whose active tab is marked by a 2px accent
// underline, not a fill. Distinct from SegmentedControl, which is the pill
// capsule — same job, different shape, and the two are not interchangeable.
//
// TabBar.css fully describes it rather than depending on App.css, which
// Storybook never loads. The panel stays with the caller; this owns only the
// tablist and the id wiring between the two.
export interface TabBarTab {
  key: string;
  label: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  active: string;
  onSelect: (key: string) => void;
  /** Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`. */
  idPrefix: string;
  "aria-label": string;
}

export function TabBar({ tabs, active, onSelect, idPrefix, ...rest }: TabBarProps) {
  return (
    <div className="zui-tabbar" role="tablist" aria-label={rest["aria-label"]}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${key}`}
          aria-selected={active === key}
          aria-controls={`${idPrefix}-panel-${key}`}
          className={active === key ? "active" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
