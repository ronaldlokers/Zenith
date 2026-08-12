// The destination menu for the Fizzy-philosophy shell (spec:
// docs/superpowers/specs/2026-08-12-fizzy-shell-design.md). Every
// destination lives behind the wordmark, which is only defensible because
// each one is also a single keystroke away — so this component renders the
// keycaps rather than hiding the shortcuts in a help screen.
//
// An owned component rather than plain shell chrome: it is an overlay, not a
// participant in the .app layout grid, so it can be self-describing inside
// @layer components the way CLAUDE.md requires.
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./WordmarkMenu.css";

export interface MenuDestination {
  /** Stable id, used as the React key and returned by onSelect. */
  id: string;
  label: string;
  /** Single-key shortcut this destination answers to. */
  shortcut: string;
  icon: React.ReactNode;
  /** Live count shown on a tile. Omitted destinations show no count. */
  count?: number;
  active: boolean;
}

export interface WordmarkMenuProps {
  /** The first three are rendered as tiles; the rest as compact rows. */
  destinations: MenuDestination[];
  /** Secondary actions, below the destinations. */
  actions: MenuDestination[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const TILE_COUNT = 3;

export function WordmarkMenu({
  destinations,
  actions,
  onSelect,
  onClose,
}: WordmarkMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Focus the panel itself rather than the first item: the menu is opened by
  // a keystroke as often as by a click, and stealing focus onto "Today"
  // makes Enter do something the user did not ask for.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tiles = destinations.slice(0, TILE_COUNT);
  const rows = destinations.slice(TILE_COUNT);

  return (
    <div
      className="zui-menu-scrim"
      // Only a hit on the scrim itself dismisses. The panel is a descendant,
      // so without this check every click inside would close the menu.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="zui-menu"
        ref={ref}
        tabIndex={-1}
        role="menu"
        aria-label={t("menu.label")}
      >
        <div className="zui-menu-tiles">
          {tiles.map((d) => (
            <button
              key={d.id}
              type="button"
              role="menuitem"
              className="zui-menu-tile"
              aria-current={d.active ? "page" : undefined}
              onClick={() => onSelect(d.id)}
            >
              {d.icon}
              <span className="zui-menu-tile-label">{d.label}</span>
              <span className="zui-menu-tile-meta">
                {d.count != null ? `${d.count} · ` : ""}
                {d.shortcut}
              </span>
            </button>
          ))}
        </div>

        {rows.map((d) => (
          <button
            key={d.id}
            type="button"
            role="menuitem"
            className="zui-menu-item"
            aria-current={d.active ? "page" : undefined}
            onClick={() => onSelect(d.id)}
          >
            <span className="zui-menu-icon">{d.icon}</span>
            {d.label}
            <kbd className="zui-key">{d.shortcut}</kbd>
          </button>
        ))}

        {actions.length > 0 && <div className="zui-menu-sep" />}

        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            className="zui-menu-item"
            onClick={() => onSelect(a.id)}
          >
            <span className="zui-menu-icon">{a.icon}</span>
            {a.label}
            <kbd className="zui-key">{a.shortcut}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
