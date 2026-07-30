// Home tab (#480) — "Today": an action-first screen answering "what do I do
// now?", rebuilt around the action loop (#492). The blocks rank by how much
// they ask of the user: hero (the one number, and a handle into the work),
// the ascent strip (where the climb stands), Next Up (the work itself),
// gone-quiet (the enemy), then this week's movement. Analytics stay on the
// Insights tab (src/insights.tsx); a weekly quota you can fail is deliberately
// not here — see "This week", which observes volume instead of scoring it.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Application, StatusHistoryRow, Stats, UserGoal } from "./types";
import { api } from "./api";
import {
  computeWeeklyMomentum,
  daysFromToday,
  formatDate,
  isDead,
  isDue,
  isOverdue,
  parseSqlDate,
  searchWeekNumber,
} from "./format";
import {
  Button,
  DashCard,
  MomentumBand,
  RowMenu,
  SegmentedControl,
  Skeleton,
  StarRating,
  StatCard,
} from "./components";
import "./dashboard.css";

// The climb, low to high. Dead statuses are off the mountain and excluded.
const ASCENT_STAGES = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
] as const;

const DAY = 86400000;

export function DashboardTab({
  applications,
  onOpenJob,
  onGoToJobs,
  onError,
  onChanged,
  stats,
  notify,
  onOpenQuickAdd,
}: {
  applications: Application[];
  onOpenJob: (id: number) => void;
  onGoToJobs: () => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  stats: Stats | null;
  notify: (message: string, undo?: () => void, label?: string) => void;
  onOpenQuickAdd: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [goal, setGoal] = useState<UserGoal | null>(null);
  // Only the search-start date is read here (the weekly quota moved off
  // Today). A failure surfaces rather than being swallowed — a silently
  // missing block is worse than a message.
  useEffect(() => {
    api
      .goals()
      .then(setGoal)
      .catch((e) => onError((e as Error).message));
  }, [onError]);
  // Which half of Next Up is showing. The hero is the handle that sets it,
  // which is also what keeps the hero count and the list length honest: they
  // are the same filter, not two filters that can disagree.
  const [nextUpTab, setNextUpTab] = useState<"due" | "upcoming">("due");

  const live = useMemo(
    () => applications.filter((a) => !isDead(a.status)),
    [applications],
  );
  const due = useMemo(
    () => live.filter((a) => isOverdue(a) || isDue(a)),
    [live],
  );
  const upcoming = useMemo(
    () => live.filter((a) => a.next_action_at && !isOverdue(a) && !isDue(a)),
    [live],
  );
  const unplanned = useMemo(
    () => live.filter((a) => !a.next_action_at),
    [live],
  );

  if (!stats) return <Skeleton />;

  const daysSince = (d: string) => Math.floor((Date.now() - parseSqlDate(d)) / DAY);

  // Gone-quiet close-out (#484) — early-stage applications with nothing
  // scheduled that haven't moved in 3+ weeks. A graceful, one-tap way to clear
  // ghosted roles: no reply is on them, not you.
  const quiet = applications
    .filter(
      (a) =>
        (a.status === "interested" || a.status === "applied") &&
        !a.next_action_at &&
        daysSince(a.updated_at) >= 21,
    )
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(0, 5);

  const closeOut = (a: Application) =>
    Promise.resolve(api.archiveApplication(a.id))
      .then(() => onChanged())
      .then(() =>
        notify(t("today.closedOut"), () =>
          Promise.resolve(api.unarchiveApplication(a.id))
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));

  const searchWeek = searchWeekNumber(
    goal?.search_started_at ??
      stats.applications.reduce<string | null>((min, a) => {
        const d = a.applied_at ?? a.created_at;
        return d && (!min || d < min) ? d : min;
      }, null),
    Date.now(),
  );
  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Four honest hero states. The old single "all caught up" string was true in
  // one of them and a lie in the other three — congratulating a user who has
  // never added an application, or who has twelve rotting with nothing planned.
  const heroState =
    applications.length === 0
      ? "untracked"
      : due.length > 0
        ? "due"
        : upcoming.length > 0
          ? "clear"
          : "unplanned";

  return (
    <section className="dash today">
      <header className="today-head">
        <h1 className="today-h1">{t("today.title")}</h1>
        <p className="today-date">
          {today}
          {searchWeek != null
            ? ` · ${t("goals.searchWeek", { count: searchWeek })}`
            : ""}
        </p>
      </header>

      {heroState === "untracked" ? (
        <div className="today-start">
          <p className="today-start-h">{t("today.nothingTracked")}</p>
          <p className="today-start-hint">{t("today.nothingTrackedHint")}</p>
          <Button variant="primary" onClick={onOpenQuickAdd}>
            {t("today.addFirst")}
          </Button>
        </div>
      ) : (
        <div className="today-cols">
          <div className="today-col">
            {heroState === "due" && (
              <StatCard
                hero
                className="today-hero"
                value={due.length}
                label={t("today.needYou", { count: due.length })}
                onClick={() => setNextUpTab("due")}
              />
            )}
            {heroState === "clear" && (
              <StatCard
                hero
                className="today-hero"
                value={upcoming.length}
                label={t("today.scheduledNoneDue", { count: upcoming.length })}
                onClick={() => setNextUpTab("upcoming")}
              />
            )}
            {heroState === "unplanned" && (
              <>
                <StatCard
                  hero
                  className="today-hero"
                  value={unplanned.length}
                  label={t("today.unplanned", { count: unplanned.length })}
                />
                <p className="today-unplanned-hint">
                  {t("today.unplannedHint")}{" "}
                  <Button variant="link" onClick={onGoToJobs}>
                    {t("overview.viewAllJobs")}
                  </Button>
                </p>
              </>
            )}

            <AscentStrip live={live} />

            <NextUpPanel
              due={due}
              upcoming={upcoming}
              tab={nextUpTab}
              onTab={setNextUpTab}
              onOpenJob={onOpenJob}
              notify={notify}
              onChanged={onChanged}
              onError={onError}
            />
          </div>

          <div className="today-col">
            {quiet.length > 0 && (
              <div className="today-quiet">
                <h2 className="today-quiet-h">{t("today.quietTitle")}</h2>
                <p className="today-quiet-hint muted small">
                  {t("today.quietHint")}
                </p>
                <ul className="today-quiet-list">
                  {quiet.map((a) => (
                    <li key={a.id} className={`stage-${a.status}`}>
                      <button
                        className="today-quiet-open"
                        onClick={() => onOpenJob(a.id)}
                      >
                        <span className="side-title">{a.title}</span>
                        <span className="side-co">
                          {a.company_name ?? "—"} ·{" "}
                          {t("today.quietAge", {
                            days: daysSince(a.updated_at),
                          })}
                        </span>
                      </button>
                      <button
                        className="today-quiet-close"
                        onClick={() => closeOut(a)}
                      >
                        {t("today.closeOut")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ThisWeek
              stats={stats}
              applications={applications}
              onOpenJob={onOpenJob}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// The climb as state (#492): where live applications sit across the five
// rungs, right now. A glance, not a chart — Insights keeps the funnel and the
// conversion maths. Each segment carries its count and label as text, so the
// stage hue is never the only thing saying which rung this is.
function AscentStrip({ live }: { live: Application[] }) {
  const { t } = useTranslation();
  const counts = ASCENT_STAGES.map(
    (st) => live.filter((a) => a.status === st).length,
  );
  if (live.length === 0) return null;
  return (
    <ul className="today-ascent" aria-label={t("today.ascentLabel")}>
      {ASCENT_STAGES.map((st, i) => (
        <li
          key={st}
          className={`stage-${st}${counts[i] === 0 ? " is-empty" : ""}`}
          style={{ flexGrow: Math.max(counts[i], 0.4) }}
        >
          <span className="today-ascent-bar" aria-hidden="true" />
          <span className="today-ascent-n">{counts[i]}</span>
          <span className="today-ascent-l">{t(`stages.${st}`)}</span>
        </li>
      ))}
    </ul>
  );
}

function NextUpPanel({
  due,
  upcoming,
  tab,
  onTab,
  onOpenJob,
  onChanged,
  onError,
  notify,
}: {
  due: Application[];
  upcoming: Application[];
  tab: "due" | "upcoming";
  onTab: (tab: "due" | "upcoming") => void;
  onOpenJob: (id: number) => void;
  onChanged: () => Promise<unknown> | void;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void, label?: string) => void;
}) {
  const { t } = useTranslation();
  const rows = (tab === "due" ? due : upcoming)
    .slice()
    .sort((a, b) => {
      const byDate = (a.next_action_at ?? "").localeCompare(
        b.next_action_at ?? "",
      );
      if (byDate !== 0) return byDate;
      return (b.fit_score ?? 0) - (a.fit_score ?? 0);
    })
    .slice(0, 6);

  // Inline follow-up actions (#285) — complete or push a reminder without
  // leaving Today. Opening the row is what actually does the follow-up; these
  // two only clear it or move it, so both are undoable.
  const done = (a: Application) => {
    const prev = {
      next_action: a.next_action ?? null,
      next_action_at: a.next_action_at ?? null,
    };
    return Promise.resolve(
      api.updateFollowUp(a.id, { next_action: null, next_action_at: null }),
    )
      .then(() => onChanged())
      .then(() =>
        notify(t("nextUp.doneToast"), () =>
          api
            .updateFollowUp(a.id, prev)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));
  };
  const snooze = (a: Application, days: number) => {
    const prev = {
      next_action: a.next_action ?? null,
      next_action_at: a.next_action_at ?? null,
    };
    const at = daysFromToday(days);
    return Promise.resolve(
      api.updateFollowUp(a.id, {
        next_action: a.next_action ?? null,
        next_action_at: at,
      }),
    )
      .then(() => onChanged())
      .then(() =>
        notify(t("nextUp.snoozeToast", { date: formatDate(at) }), () =>
          api
            .updateFollowUp(a.id, prev)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));
  };

  return (
    <section className="today-nextup">
      <div className="today-nextup-head">
        <h2 className="side-h">{t("nextUp.title")}</h2>
        <SegmentedControl role="group" aria-label={t("nextUp.title")}>
          <SegmentedControl.Item
            active={tab === "due"}
            onClick={() => onTab("due")}
          >
            {t("nextUp.segDue", { count: due.length })}
          </SegmentedControl.Item>
          <SegmentedControl.Item
            active={tab === "upcoming"}
            onClick={() => onTab("upcoming")}
          >
            {t("nextUp.segUpcoming", { count: upcoming.length })}
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">
          {tab === "due" ? t("nextUp.emptyDue") : t("empty.noFollowUps")}
        </p>
      ) : (
        <ul className="today-rows" aria-label={t("nextUp.title")}>
          {rows.map((a) => (
            <li key={a.id} className={`stage-${a.status}`}>
              <button
                className="today-row-open"
                onClick={() => onOpenJob(a.id)}
              >
                <span
                  className={`side-date${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
                >
                  {formatDate(a.next_action_at!)}
                  {isOverdue(a)
                    ? ` · ${t("urgency.overdue")}`
                    : isDue(a)
                      ? ` · ${t("urgency.today")}`
                      : ""}
                </span>
                <span className="side-title">
                  {a.title}
                  {a.fit_score ? (
                    <span className="fit-stars">
                      {" "}
                      <StarRating value={a.fit_score} readOnly />
                    </span>
                  ) : null}
                </span>
                <span className="side-co">{a.company_name ?? "—"}</span>
                <span className="side-stage">{t(`stages.${a.status}`)}</span>
              </button>
              <span className="nextup-actions">
                <Button variant="secondary" onClick={() => done(a)}>
                  {t("nextUp.done")}
                </Button>
                <RowMenu
                  label={t("nextUp.actionsFor", { title: a.title })}
                  items={[
                    {
                      label: t("nextUp.snooze3d"),
                      onSelect: () => void snooze(a, 3),
                    },
                    {
                      label: t("nextUp.snooze1w"),
                      onSelect: () => void snooze(a, 7),
                    },
                  ]}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The climb as motion (#492) — this week's volume as an observation (not a
// quota), over the stage changes that actually happened. Replaces the old
// read-only "Recently updated" list, which reported edits rather than progress
// and closed the page on a ghosting.
function ThisWeek({
  stats,
  applications,
  onOpenJob,
}: {
  stats: Stats;
  applications: Application[];
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const mom = computeWeeklyMomentum(stats.applications, stats.history);
  const weekMax = Math.max(1, ...mom.weeks.map((w) => w.count));
  const thisWeek = mom.weeks[mom.weeks.length - 1]?.count ?? 0;
  const lastWeek = mom.weeks[mom.weeks.length - 2]?.count ?? 0;

  const since = Date.now() - 7 * DAY;
  const byApp = new Map<number, StatusHistoryRow>();
  for (const h of stats.history) {
    if (parseSqlDate(h.changed_at) < since) continue;
    const prev = byApp.get(h.application_id);
    if (!prev || prev.changed_at < h.changed_at) byApp.set(h.application_id, h);
  }
  const moves = [...byApp.values()]
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .map((h) => ({ h, app: applications.find((a) => a.id === h.application_id) }))
    .filter((m): m is { h: StatusHistoryRow; app: Application } => !!m.app)
    .slice(0, 5);

  // Two sibling cards, not one card wrapping another: MomentumBand is already
  // a tier-2 surface, and nesting a surface inside a surface is depth the
  // three tiers have no vocabulary for (#492).
  return (
    <>
      <MomentumBand
        eyebrow={t("today.sentEyebrow")}
        verdict={t("today.sent", { count: thisWeek })}
        detail={t("today.vsLastWeek", { count: lastWeek })}
        bars={mom.weeks.map((w) => ({
          heightPct: Math.max(4, (w.count / weekMax) * 100),
          dim: w.count === 0,
        }))}
      />
      <DashCard heading={<h2 className="today-card-h">{t("today.moved")}</h2>}>
        {moves.length === 0 ? (
          <p className="muted small today-moved-empty">{t("today.noMoves")}</p>
        ) : (
          <ul className="today-rows today-moved" aria-label={t("today.moved")}>
            {moves.map(({ h, app }) => (
              <li key={h.application_id} className={`stage-${h.to_status}`}>
                <button
                  className="today-row-open"
                  onClick={() => onOpenJob(app.id)}
                >
                  <span className="side-title">{app.title}</span>
                  <span className="side-co">{app.company_name ?? "—"}</span>
                  <span className="side-stage">
                    {h.from_status ? (
                      <>
                        {t(`stages.${h.from_status}`)}
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only">{t("today.movedTo")}</span>
                      </>
                    ) : null}
                    {t(`stages.${h.to_status}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </>
  );
}
