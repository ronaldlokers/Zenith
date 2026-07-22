import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, today } from "../format";
import type { AgendaEntry } from "../types";
import "./CalendarMonth.css";

// Extracted verbatim from calendar.tsx (#386 #10 — the desktop calendar
// month grid: a header with month nav, a weekday row, day cells with
// kind-coloured event chips, and an Upcoming rail) as part of the #285
// App.tsx split — self-contained (except shared .btn-secondary).
// CalendarMonth.css reproduces the App.css .cal-* recipe (App.css:1729-1935)
// under the .zui-cal-* names this component emits. CalendarTab's mobile
// agenda list is a separate view and stays in calendar.tsx.
export interface CalendarMonthProps {
  entries: AgendaEntry[];
  onJump: (title: string) => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// A compact chip label for the month grid: the company (or title) reads at a
// glance; the full agenda text is the tooltip. Colour comes from the kind.
function chipLabel(e: AgendaEntry): string {
  return e.company_name ?? e.title ?? "";
}

// Duplicated (not shared) from calendar.tsx's agendaText: the same tiny pure
// formatter is used by CalendarTab's mobile agenda list, but this component
// is self-contained by convention (#285), so it carries its own copy.
function agendaText(
  e: AgendaEntry,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const where = [e.company_name, e.contact_name].filter(Boolean).join(" · ");
  if (e.kind === "due") {
    return `${e.label ?? t("agenda.followUp")} — ${e.title ?? ""}${where ? ` (${where})` : ""}`;
  }
  if (e.kind === "interaction") {
    const label = e.type ? t(`interactionTypes.${e.type}`) : t("agenda.touchpoint");
    return `${label}${e.title ? ` — ${e.title}` : ""}${where ? ` (${where})` : ""}`;
  }
  return `${t("agenda.appliedTo")} ${e.title ?? ""}${where ? ` ${t("agenda.at")} ${where}` : ""}`;
}

export function CalendarMonth({ entries, onJump }: CalendarMonthProps) {
  const { t, i18n } = useTranslation();
  const todayStr = today();
  const [view, setView] = useState(() => ({
    y: Number(todayStr.slice(0, 4)),
    m: Number(todayStr.slice(5, 7)) - 1,
  }));

  const byDay = new Map<string, AgendaEntry[]>();
  for (const e of entries) {
    const d = e.date.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
  }

  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(view.y, view.m, 1 - startOffset + i);
    const ds = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    return {
      ds,
      day: dt.getDate(),
      inMonth: dt.getMonth() === view.m,
      events: byDay.get(ds) ?? [],
    };
  });
  // Drop a trailing all-out-of-month week so short months don't show a blank row.
  const weeks = [0, 1, 2, 3, 4, 5]
    .map((w) => cells.slice(w * 7, w * 7 + 7))
    .filter((week) => week.some((c) => c.inMonth));

  const loc = i18n.resolvedLanguage;
  const dow = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-01 is a Monday.
    new Intl.DateTimeFormat(loc, { weekday: "short" }).format(new Date(2024, 0, 1 + i)),
  );
  const monthLabel = new Intl.DateTimeFormat(loc, {
    month: "long",
    year: "numeric",
  }).format(first);
  const upcoming = entries
    .filter((e) => e.date.slice(0, 10) >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const move = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () =>
    setView({ y: Number(todayStr.slice(0, 4)), m: Number(todayStr.slice(5, 7)) - 1 });
  const MAX = 3;

  return (
    <div className="zui-cal-month">
      <div className="zui-cal-month-head">
        <h3>{monthLabel}</h3>
        <button
          className="btn-secondary zui-cal-nav"
          onClick={() => move(-1)}
          aria-label={t("calendar.prevMonth")}
        >
          ‹
        </button>
        <button
          className="btn-secondary zui-cal-nav"
          onClick={() => move(1)}
          aria-label={t("calendar.nextMonth")}
        >
          ›
        </button>
        <button className="btn-secondary" onClick={goToday}>
          {t("calendar.today")}
        </button>
        <span className="zui-cal-count">
          {t("calendar.eventCount", { count: entries.length })}
        </span>
      </div>
      <div className="zui-cal-body">
        <div className="zui-cal-grid" role="grid">
          <div className="zui-cal-dow">
            {dow.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="zui-cal-week" key={wi}>
              {week.map((c) => (
                <div
                  key={c.ds}
                  className={`zui-cal-day${c.inMonth ? "" : " out"}${c.ds === todayStr ? " today" : ""}`}
                >
                  <span className="zui-cal-daynum">{c.day}</span>
                  {c.events.slice(0, MAX).map((e) => (
                    <button
                      key={`${e.kind}-${e.id}`}
                      className={`zui-cal-chip kind-${e.kind}`}
                      title={agendaText(e, t)}
                      onClick={() => e.title && onJump(e.title)}
                    >
                      {chipLabel(e)}
                    </button>
                  ))}
                  {c.events.length > MAX && (
                    <span className="zui-cal-more">
                      {t("calendar.moreEvents", { count: c.events.length - MAX })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <aside className="zui-cal-rail">
          <p className="zui-cal-rail-h">{t("calendar.upcoming")}</p>
          {upcoming.length === 0 && (
            <p className="muted small">{t("calendar.empty")}</p>
          )}
          {upcoming.map((e) => (
            <button
              key={`${e.kind}-${e.id}`}
              className="zui-cal-up"
              onClick={() => e.title && onJump(e.title)}
            >
              <span className={`zui-cal-up-dot kind-${e.kind}`} aria-hidden="true" />
              <span className="zui-cal-up-body">
                <span className="zui-cal-up-title">{agendaText(e, t)}</span>
                <span className="zui-cal-up-date">{formatDate(e.date.slice(0, 10))}</span>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
