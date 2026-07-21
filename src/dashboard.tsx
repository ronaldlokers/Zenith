// Dashboard view extracted from App.tsx (#285 split) — the home tab: KPI
// cards, weekly momentum, Next-Up action list, recent activity, and the
// "all the numbers" analytics drawer (StatsTab).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Application, Stats } from "./types";
import { api } from "./api";
import {
  FUNNEL_STAGES,
  funnelConversions,
  funnelReachCounts,
  responseRate,
} from "./stats";
import {
  ageDays,
  computePipelineMomentum,
  computeWeeklyMomentum,
  formatDate,
  isDead,
  isDue,
  isOverdue,
  medianTimeToOffer,
  totalComp,
} from "./format";
import { StatsTab } from "./stats-view";
import { ActivityTab } from "./calendar";
import { Button, DashCard, StatCard, StatLine } from "./components";
import { LoadingSkeleton } from "./ui";
import { rowActivate } from "./hooks";

export function DashboardTab({
  applications,
  fullApps,
  onGoToJobs,
  onOpenJob,
  onError,
  onChanged,
  stats,
  notify,
  onOpenQuickAdd,
}: {
  applications: Application[];
  fullApps: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  stats: Stats | null;
  notify: (message: string, undo?: () => void, label?: string) => void;
  onOpenQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const [showActivity, setShowActivity] = useState(false);
  if (!stats) return <LoadingSkeleton />;
  const history = stats.history;
  const open = applications.filter((a) => !isDead(a.status));
  const upcoming = applications.filter(
    (a) => a.next_action_at && !isDead(a.status),
  );
  const hasActions = upcoming.length > 0;

  const counts = funnelReachCounts(history);
  const funnelMax = Math.max(1, counts[0] ?? 0);
  const conv = funnelConversions(history);
  const resp = responseRate(history);
  const mom = computeWeeklyMomentum(stats.applications, history);
  const weekMax = Math.max(1, ...mom.weeks.map((w) => w.count));
  const pipe = computePipelineMomentum(history);
  const t2o = medianTimeToOffer(history);
  const liveOffers = applications.filter((a) => a.status === "offer");
  const comps = liveOffers
    .map((o) => totalComp(o))
    .filter((x): x is number => x != null);
  const topComp = comps.length ? Math.max(...comps) : null;
  const recent = [...applications]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  const fmtComp = (n: number) =>
    `~${liveOffers[0]?.salary_currency ?? "€"} ${Math.round(n).toLocaleString()}`;

  const kpis = (
    <div className="dash-kpis">
      <StatCard
        value={open.length}
        label={t("dashboard.kpiOpen")}
        onClick={onGoToJobs}
      />
      <StatCard
        value={`${Math.round(resp.rate * 100)}%`}
        label={t("dashboard.kpiResponse", {
          responded: resp.responded,
          applied: resp.applied,
        })}
        onClick={onGoToJobs}
      />
      <StatCard
        value={liveOffers.length}
        label={
          <>
            {t("dashboard.kpiOffers")}
            {topComp != null ? ` · ${fmtComp(topComp)}` : ""}
          </>
        }
        onClick={() => liveOffers[0] && onOpenJob(liveOffers[0].id)}
      />
      <StatCard
        value={t2o != null ? `~${Math.round(t2o)}d` : "—"}
        label={t("dashboard.kpiToOffer")}
      />
    </div>
  );

  const band = (
    <div className="dash-band">
      <div>
        <span className="dash-eyebrow">{t("dashboard.momentumTitle")}</span>
        <div className="dash-band-verdict">{t(`stats.momentum.${pipe.verdict}`)}</div>
        <div className="muted small">
          {t("stats.momentumDetail", { recent: pipe.recent, prior: pipe.prior })}
        </div>
      </div>
      <div className="dash-spark" aria-hidden="true">
        {mom.weeks.map((w, i) => (
          <i
            key={i}
            style={{ height: `${Math.max(4, (w.count / weekMax) * 100)}%` }}
            className={w.count === 0 ? "dim" : ""}
          />
        ))}
      </div>
    </div>
  );

  const funnelCard = (
    <DashCard
      heading={t("dashboard.funnelConv")}
      win={t("dashboard.winLiveAllTime")}
      onClick={onGoToJobs}
      key="funnel"
    >
      <div className="dash-funnel">
        {FUNNEL_STAGES.map((st, i) => (
          <div className={`dash-fn stage-${st}`} key={st}>
            <span className="dash-fl">{t(`stages.${st}`)}</span>
            <span className="dash-fbar">
              <i style={{ width: `${(counts[i] / funnelMax) * 100}%` }} />
            </span>
            <span className="dash-fn-n">{counts[i]}</span>
          </div>
        ))}
      </div>
      <div className="muted small mono dash-conv-line">
        {conv.map((c) => `${Math.round(c.rate * 100)}%`).join(" · ")}{" "}
        {t("dashboard.stageToStage")}
      </div>
    </DashCard>
  );

  const offersCard = (
    <DashCard heading={t("dashboard.offers")} win={t("dashboard.winOpen")} key="offers">
      {liveOffers.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t("dashboard.noOffers")}
        </p>
      ) : (
        <ul className="dash-offers">
          {liveOffers.slice(0, 3).map((o) => {
            const tc = totalComp(o);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className="dash-orow click"
                  onClick={() => onOpenJob(o.id)}
                >
                  <span className="dash-ot">{o.title}</span>
                  <span className="dash-ov">{tc != null ? fmtComp(tc) : "—"}</span>
                  <span className="dash-oc muted">
                    {o.company_name ?? "—"}
                    {o.salary_range ? ` · ${o.salary_range}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );

  const fortnightCard = (
    <DashCard heading={t("dashboard.thisFortnight")} win={t("dashboard.win2wk")} key="fortnight">
      <StatLine
        label={t("dashboard.response")}
        value={`${Math.round(resp.rate * 100)}%`}
      />
      <StatLine
        label={t("dashboard.toOffer")}
        value={t2o != null ? `~${Math.round(t2o)}d` : "—"}
      />
      <StatLine
        label={t("dashboard.momentumTitle")}
        value={t(`stats.momentum.${pipe.verdict}`)}
      />
    </DashCard>
  );

  const analytics = [funnelCard, offersCard, fortnightCard];

  const activityCard = (
    <DashCard heading={t("overview.recentlyUpdated")} key="activity">
      {recent.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t("overview.noActivity")}
        </p>
      ) : (
        <ul className="side-list dash-recent">
          {recent.map((a) => (
            <li
              key={a.id}
              className={`stage-${a.status} clickable`}
              {...rowActivate(() => onOpenJob(a.id))}
            >
              <span className="side-date">{ageDays(a.updated_at)}</span>
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
    <section className="dash">
      {kpis}
      {band}
      {hasActions ? (
        <div className="dash-cols">
          <div className="dash-col">
            <DashCard lead>
              <NextUpPanel
                notify={notify}
                applications={applications}
                onChanged={onChanged}
                onError={onError}
              />
            </DashCard>
            {activityCard}
          </div>
          <div className="dash-col">{analytics}</div>
        </div>
      ) : (
        <>
          <div className="dash-caughtup">
            <span className="dash-caughtup-tick">✓</span>
            <span className="dash-caughtup-t">{t("dashboard.caughtUp")}</span>
            <span className="sp" />
            <Button variant="link"
              onClick={onOpenQuickAdd}
            >
              {t("dashboard.addFollowUp")}
            </Button>
          </div>
          <div className="dash-cols">
            <div className="dash-col">{analytics}</div>
            <div className="dash-col">{activityCard}</div>
          </div>
        </>
      )}

      <button
        className="btn-secondary overview-activity-toggle"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
      >
        {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
      </button>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}

      <details className="dash-details">
        <summary>{t("dashboard.allNumbers")}</summary>
        <StatsTab stats={stats} fullApps={fullApps} />
      </details>
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
        <ul className="side-list">
          {upcoming.map((a) => (
            <li key={a.id} className={`stage-${a.status}`}>
              <span
                className={`side-date${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
              >
                {formatDate(a.next_action_at!)}
              </span>
              <span className="side-title">
                {a.title}
                {a.fit_score ? (
                  <span className="fit-stars"> {"★".repeat(a.fit_score)}</span>
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
        </ul>
      )}
    </aside>
  );
}
