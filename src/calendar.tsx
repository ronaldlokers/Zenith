// Calendar (agenda) + Activity views extracted from App.tsx (#285 split) —
// the forward-looking agenda and the reverse-chron activity feed, with
// their row-formatting helpers.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { LoadFailed, LoadingSkeleton } from "./ui";
import { rowActivate } from "./hooks";
import { EmptyActivityIcon, EmptyCalendarIcon } from "./icons";
import { formatDate, today } from "./format";
import type { ActivityEvent, AgendaEntry } from "./types";

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

const pad2 = (n: number) => String(n).padStart(2, "0");
// A compact chip label for the month grid: the company (or title) reads at a
// glance; the full agenda text is the tooltip. Colour comes from the kind.
function chipLabel(e: AgendaEntry): string {
  return e.company_name ?? e.title ?? "";
}

// Month grid (#386 #10) — the desktop calendar: a full month with kind-coloured
// event chips beside an Upcoming rail. The agenda list stays for mobile.
function CalendarMonth({
  entries,
  onJump,
}: {
  entries: AgendaEntry[];
  onJump: (title: string) => void;
}) {
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
    <div className="cal-month">
      <div className="cal-month-head">
        <h3>{monthLabel}</h3>
        <button
          className="btn-secondary cal-nav"
          onClick={() => move(-1)}
          aria-label={t("calendar.prevMonth")}
        >
          ‹
        </button>
        <button
          className="btn-secondary cal-nav"
          onClick={() => move(1)}
          aria-label={t("calendar.nextMonth")}
        >
          ›
        </button>
        <button className="btn-secondary" onClick={goToday}>
          {t("calendar.today")}
        </button>
        <span className="cal-count">
          {t("calendar.eventCount", { count: entries.length })}
        </span>
      </div>
      <div className="cal-body">
        <div className="cal-grid" role="grid">
          <div className="cal-dow">
            {dow.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="cal-week" key={wi}>
              {week.map((c) => (
                <div
                  key={c.ds}
                  className={`cal-day${c.inMonth ? "" : " out"}${c.ds === todayStr ? " today" : ""}`}
                >
                  <span className="cal-daynum">{c.day}</span>
                  {c.events.slice(0, MAX).map((e) => (
                    <button
                      key={`${e.kind}-${e.id}`}
                      className={`cal-chip kind-${e.kind}`}
                      title={agendaText(e, t)}
                      onClick={() => e.title && onJump(e.title)}
                    >
                      {chipLabel(e)}
                    </button>
                  ))}
                  {c.events.length > MAX && (
                    <span className="cal-more">
                      {t("calendar.moreEvents", { count: c.events.length - MAX })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <aside className="cal-rail">
          <p className="cal-rail-h">{t("calendar.upcoming")}</p>
          {upcoming.length === 0 && (
            <p className="muted small">{t("calendar.empty")}</p>
          )}
          {upcoming.map((e) => (
            <button
              key={`${e.kind}-${e.id}`}
              className="cal-up"
              onClick={() => e.title && onJump(e.title)}
            >
              <span className={`cal-up-dot kind-${e.kind}`} aria-hidden="true" />
              <span className="cal-up-body">
                <span className="cal-up-title">{agendaText(e, t)}</span>
                <span className="cal-up-date">{formatDate(e.date.slice(0, 10))}</span>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

export function CalendarTab({
  onError,
  onJump,
}: {
  onError: (message: string | null) => void;
  onJump: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AgendaEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api
      .agenda()
      .then(setEntries)
      .catch((e) => {
        setFailed(true);
        onError((e as Error).message);
      });
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed && !entries) return <LoadFailed onRetry={load} />;
  if (!entries) return <p className="muted small">{t("common.loading")}</p>;

  const todayStr = today();
  const groups = new Map<string, AgendaEntry[]>();
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(e);
    groups.set(day, list);
  }
  const days = [...groups.keys()].sort();

  return (
    <section className="calendar-view">
      {days.length === 0 && (
        <p className="empty">
          <EmptyCalendarIcon />
          {t("calendar.empty")}
        </p>
      )}
      {/* Desktop: month grid. Mobile: the agenda list below. */}
      {days.length > 0 && <CalendarMonth entries={entries} onJump={onJump} />}
      <div className="agenda">
        {days.map((day) => (
          <div key={day} className="agenda-day">
            <h3
              className={`agenda-date${day === todayStr ? " today" : day < todayStr ? " past" : ""}`}
            >
              {formatDate(day)}
              {day === todayStr ? t("calendar.todaySuffix") : ""}
            </h3>
            <ul className="agenda-items">
              {(groups.get(day) ?? []).map((e) => (
                <li
                  key={`${e.kind}-${e.id}`}
                  className={`agenda-item kind-${e.kind}`}
                  {...rowActivate(() => e.title && onJump(e.title))}
                >
                  {agendaText(e, t)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// Activity feed (#129) — reverse-chronological across every application:
// status changes, interactions, documents attached. Distinct from the
// per-application timeline in the detail modal, which only covers one job.
function activityText(
  e: ActivityEvent,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const co = e.company_name ? ` · ${e.company_name}` : "";
  if (e.kind === "status") {
    const from = e.from_status ? t(`stages.${e.from_status}`) : null;
    const to = e.to_status ? t(`stages.${e.to_status}`) : "";
    return `${e.title}${co} — ${from ? `${from} → ${to}` : to}`;
  }
  if (e.kind === "interaction") {
    const type = e.type ? t(`interactionTypes.${e.type}`) : "";
    return `${t("timeline.loggedOn", { type, title: e.title })}${co}${e.notes ? ` — ${e.notes}` : ""}`;
  }
  return `${t("timeline.attachedTo", { filename: e.filename, title: e.title })}${co}`;
}

export function ActivityTab({
  onError,
  onOpenJob,
}: {
  onError: (message: string | null) => void;
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api
      .activity()
      .then(setEvents)
      .catch((e) => {
        setFailed(true);
        onError((e as Error).message);
      });
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed && !events) return <LoadFailed onRetry={load} />;
  if (!events) return <LoadingSkeleton />;

  return (
    <section className="activity">
      {events.length === 0 && (
        <p className="empty">
          <EmptyActivityIcon />
          {t("activityFeed.empty")}
        </p>
      )}
      <ul className="activity-list">
        {events.map((e) => (
          <li
            key={`${e.kind}-${e.application_id}-${e.ts}`}
            className={`activity-item kind-${e.kind}`}
            {...rowActivate(() => onOpenJob(e.application_id))}
          >
            <span className="activity-date">{formatDate(e.ts.slice(0, 10))}</span>
            <span className="activity-text">{activityText(e, t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

