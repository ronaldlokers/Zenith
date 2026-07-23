// Home tab (#480) — recast as "Today": an action-first screen answering
// "what do I do now?" (overdue/due follow-ups + weekly momentum), with the
// recent-activity glance. The analytics (KPIs, funnel, offers, stats drawer)
// moved to the Insights tab (src/insights.tsx).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Application, Stats, UserGoal } from "./types";
import { api } from "./api";
import {
  computeWeeklyMomentum,
  formatDate,
  goalStreak,
  isDead,
  isDue,
  isOverdue,
  parseSqlDate,
  searchWeekNumber,
} from "./format";
import { Button, DashCard, SideList, StarRating } from "./components";
import { LoadingSkeleton } from "./ui";
import { rowActivate } from "./hooks";

export function DashboardTab({
  applications,
  onOpenJob,
  onError,
  onChanged,
  stats,
  notify,
  onOpenQuickAdd,
}: {
  applications: Application[];
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  stats: Stats | null;
  notify: (message: string, undo?: () => void, label?: string) => void;
  onOpenQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState<UserGoal | null>(null);
  useEffect(() => {
    api.goals().then(setGoal).catch(() => {});
  }, []);
  if (!stats) return <LoadingSkeleton />;
  const history = stats.history;

  // Things that need you today: overdue or due-today follow-ups on live apps.
  const needToday = applications.filter(
    (a) => !isDead(a.status) && (isOverdue(a) || isDue(a)),
  );
  const upcoming = applications.filter(
    (a) => a.next_action_at && !isDead(a.status),
  );
  const hasActions = upcoming.length > 0;
  const recent = [...applications]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  // Gone-quiet close-out (#484) — early-stage applications with nothing
  // scheduled that haven't moved in 3+ weeks. A graceful, one-tap way to clear
  // ghosted roles: no reply is on them, not you.
  const daysSince = (d: string) =>
    Math.floor((Date.now() - parseSqlDate(d)) / 86400000);
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

  // Weekly-goal momentum (#473) — this week's count vs target, streak, week N.
  const mom = computeWeeklyMomentum(stats.applications, history);
  const goalTarget = goal?.weekly_app_goal ?? 0;
  const thisWeek = mom.weeks[mom.weeks.length - 1]?.count ?? 0;
  const streak = goalStreak(
    mom.weeks.slice(0, -1).map((w) => w.count),
    goalTarget,
  );
  const earliestApp = stats.applications.reduce<string | null>((min, a) => {
    const d = a.applied_at ?? a.created_at;
    return d && (!min || d < min) ? d : min;
  }, null);
  const searchWeek = searchWeekNumber(
    goal?.search_started_at ?? earliestApp,
    Date.now(),
  );
  const goalPct =
    goalTarget > 0 ? Math.min(100, Math.round((thisWeek / goalTarget) * 100)) : 0;

  const goalCard = goal && goalTarget > 0 && (
    <div className="dash-goal">
      <div className="dash-goal-head">
        <span className="dash-goal-eyebrow">{t("goals.weeklyGoal")}</span>
        <span className="dash-goal-figure">
          <span className="dash-goal-n">{thisWeek}</span>
          <span className="dash-goal-target">/ {goalTarget}</span>
        </span>
      </div>
      <div
        className="dash-goal-bar"
        role="progressbar"
        aria-valuenow={thisWeek}
        aria-valuemin={0}
        aria-valuemax={goalTarget}
      >
        <i
          className={thisWeek >= goalTarget ? "met" : ""}
          style={{ width: `${goalPct}%` }}
        />
      </div>
      <div className="dash-goal-meta">
        {thisWeek >= goalTarget && (
          <span className="dash-goal-met">{t("goals.hit")}</span>
        )}
        {streak > 0 && (
          <span className="dash-goal-streak">
            {t("goals.streak", { count: streak })}
          </span>
        )}
        {searchWeek != null && (
          <span className="muted">
            {t("goals.searchWeek", { count: searchWeek })}
          </span>
        )}
      </div>
    </div>
  );

  const activityCard = (
    <DashCard heading={t("overview.recentlyUpdated")} key="activity">
      {recent.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t("overview.noActivity")}
        </p>
      ) : (
        <ul className="dash-recent">
          {recent.map((a) => (
            <li
              key={a.id}
              className={`stage-${a.status} clickable`}
              {...rowActivate(() => onOpenJob(a.id))}
            >
              <span className="dash-spine" aria-hidden="true" />
              <span className="side-title">{a.title}</span>
              <span className="side-co">{a.company_name ?? "—"}</span>
              <span className="side-stage">{t(`stages.${a.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );

  return (
    <section className="dash today">
      <div className="today-hero">
        {needToday.length > 0 ? (
          <>
            <span className="today-hero-n">{needToday.length}</span>
            <span className="today-hero-lbl">
              {t("today.needYou", { count: needToday.length })}
            </span>
          </>
        ) : (
          <span className="today-hero-lbl today-hero-clear">
            {t("today.allClear")}
          </span>
        )}
      </div>

      {goalCard}

      {hasActions ? (
        <DashCard lead>
          <NextUpPanel
            notify={notify}
            applications={applications}
            onChanged={onChanged}
            onError={onError}
          />
        </DashCard>
      ) : (
        <div className="dash-caughtup">
          <span className="dash-caughtup-tick">✓</span>
          <span className="dash-caughtup-t">{t("dashboard.caughtUp")}</span>
          <span className="sp" />
          <Button variant="link" onClick={onOpenQuickAdd}>
            {t("dashboard.addFollowUp")}
          </Button>
        </div>
      )}

      {quiet.length > 0 && (
        <div className="today-quiet">
          <p className="today-quiet-h">{t("today.quietTitle")}</p>
          <p className="today-quiet-hint muted small">{t("today.quietHint")}</p>
          <ul className="today-quiet-list">
            {quiet.map((a) => (
              <li key={a.id} className={`stage-${a.status}`}>
                <span className="dash-spine" aria-hidden="true" />
                <button
                  className="today-quiet-open"
                  onClick={() => onOpenJob(a.id)}
                >
                  <span className="side-title">{a.title}</span>
                  <span className="side-co">
                    {a.company_name ?? "—"} ·{" "}
                    {t("today.quietAge", { days: daysSince(a.updated_at) })}
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

      {activityCard}
    </section>
  );
}

function NextUpPanel({
  applications,
  onChanged,
  onError,
  notify,
}: {
  applications: Application[];
  onChanged: () => Promise<unknown> | void;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void, label?: string) => void;
}) {
  const { t } = useTranslation();
  const upcoming = applications
    .filter((a) => a.next_action_at && !isDead(a.status))
    .sort((a, b) => {
      const byDate = (a.next_action_at ?? "").localeCompare(
        b.next_action_at ?? "",
      );
      if (byDate !== 0) return byDate;
      return (b.fit_score ?? 0) - (a.fit_score ?? 0);
    })
    .slice(0, 6);

  // Inline follow-up actions (#285) — complete or push a reminder without
  // opening the edit form, so the app's core loop is actionable where it's
  // shown rather than read-only.
  const done = (a: Application) => {
    const prevFu = {
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
            .updateFollowUp(a.id, prevFu)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));
  };
  const snooze = (a: Application) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return Promise.resolve(
      api.updateFollowUp(a.id, {
        next_action: a.next_action ?? null,
        next_action_at: d.toISOString().slice(0, 10),
      }),
    )
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));
  };

  return (
    <aside className="jobs-side">
      <h3 className="side-h">{t("nextUp.title")}</h3>
      {upcoming.length === 0 ? (
        <p className="muted small">{t("empty.noFollowUps")}</p>
      ) : (
        <SideList>
          {upcoming.map((a) => (
            <li key={a.id} className={`stage-${a.status}`}>
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
              <span className="nextup-actions">
                <button onClick={() => done(a)}>{t("nextUp.done")}</button>
                <button onClick={() => snooze(a)}>{t("nextUp.snooze")}</button>
              </span>
            </li>
          ))}
        </SideList>
      )}
    </aside>
  );
}
