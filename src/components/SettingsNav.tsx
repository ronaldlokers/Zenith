import "./SettingsNav.css";

// The section rail of the Settings/Admin two-pane layout (App.css:3587).
// Admin reuses the same shell, so the two call sites were identical
// hand-written markup.
//
// A nav, not a tablist: the sections are page-level destinations (Settings
// deep-links them via /settings?s=…), so the active one is marked with
// aria-current, matching the markup this replaces. Do not "upgrade" it to
// role="tab" — that would promise arrow-key roving this does not implement.
//
// SettingsNav.css fully describes it rather than depending on App.css, which
// Storybook never loads — including the mobile block, which is the layout on
// a phone and not an optional extra.
export interface SettingsNavSection<K extends string> {
  key: K;
  label: string;
}

export interface SettingsNavProps<K extends string> {
  sections: SettingsNavSection<K>[];
  active: K;
  onSelect: (key: K) => void;
  "aria-label": string;
}

export function SettingsNav<K extends string>({
  sections,
  active,
  onSelect,
  ...rest
}: SettingsNavProps<K>) {
  return (
    <nav className="zui-settingsnav" aria-label={rest["aria-label"]}>
      {sections.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={active === key ? "active" : undefined}
          aria-current={active === key ? "true" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
