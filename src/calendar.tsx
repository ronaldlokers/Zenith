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
    <section className="agenda">
      {days.length === 0 && (
        <p className="empty">
          <EmptyCalendarIcon />
          {t("calendar.empty")}
        </p>
      )}
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

