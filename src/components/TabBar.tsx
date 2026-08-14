import { useRef } from "react";
import { tablistKeyDown } from "./tablist-keys";
import "./TabBar.css";

// The underline tab bar from the application detail view (App.css:3989):
// a hairline-bottomed row whose active tab is marked by a 2px accent
// underline, not a fill. Distinct from SegmentedControl, which is the pill
// capsule — same job, different shape, and the two are not interchangeable.
//
// TabBar.css fully describes it rather than depending on App.css, which
// Storybook never loads. The panel stays with the caller; this owns only the
// tablist and the id wiring between the two.
export interface TabBarTab<K extends string> {
  key: K;
  label: string;
}

export interface TabBarProps<K extends string> {
  tabs: TabBarTab<K>[];
  active: K;
  onSelect: (key: K) => void;
  /** Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`. */
  idPrefix: string;
  "aria-label": string;
}

export function TabBar<K extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  ...rest
}: TabBarProps<K>) {
  const refs = useRef(new Map<K, HTMLElement | null>()).current;
  return (
    <div className="zui-tabbar" role="tablist" aria-label={rest["aria-label"]}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${key}`}
          ref={(el) => {
            refs.set(key, el);
          }}
          aria-selected={active === key}
          // Only the active tab's panel is rendered by the caller, so only
          // the active tab points at one. Emitting it for every tab left two
          // of three references dangling on every render (#517).
          aria-controls={
            active === key ? `${idPrefix}-panel-${key}` : undefined
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
