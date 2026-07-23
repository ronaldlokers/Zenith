// Insights tab (#480) — the analytics that used to sit on the dashboard home.
// Moved off the daily "Today" screen so the home answers "what do I do now?"
// while the numbers live here for when you want them. KPIs, weekly momentum,
// funnel/conversion, live offers, and the full stats drawer.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Application, Stats } from "./types";
import {
  FUNNEL_STAGES,
  funnelConversions,
  funnelReachCounts,
  responseRate,
} from "./stats";
import {
  computePipelineMomentum,
  computeWeeklyMomentum,
  isDead,
  medianTimeToOffer,
  totalComp,
} from "./format";
import { StatsTab } from "./stats-view";
import { ActivityTab, CalendarTab } from "./calendar";
import { DashCard, MomentumBand, StatCard } from "./components";
import { LoadingSkeleton } from "./ui";

export function InsightsTab({
  applications,
  fullApps,
  onGoToJobs,
  onOpenJob,
  onError,
  onJump,
  stats,
}: {
  applications: Application[];
  fullApps: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onJump: (title: string) => void;
  stats: Stats | null;
}) {
  const { t } = useTranslation();
  const [showActivity, setShowActivity] = useState(false);
  if (!stats) return <LoadingSkeleton />;
  const history = stats.history;
  const open = applications.filter((a) => !isDead(a.status));

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

  const fmtComp = (n: number) =>
    `~${liveOffers[0]?.salary_currency ?? "€"} ${Math.round(n).toLocaleString()}`;

  return (
    <section className="dash">
      <div className="dash-kpis">
        <StatCard
          value={open.length}
          label={t("dashboard.kpiOpen")}
          onClick={onGoToJobs}
          hero
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

      <MomentumBand
        eyebrow={t("dashboard.momentumTitle")}
        verdict={t(`stats.momentum.${pipe.verdict}`)}
        detail={t("stats.momentumDetail", {
          recent: pipe.recent,
          prior: pipe.prior,
        })}
        bars={mom.weeks.map((w) => ({
          heightPct: Math.max(4, (w.count / weekMax) * 100),
          dim: w.count === 0,
        }))}
      />

      <div className="dash-cols">
        <DashCard
          heading={t("dashboard.funnelConv")}
          win={t("dashboard.winLiveAllTime")}
          onClick={onGoToJobs}
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

        <DashCard heading={t("dashboard.offers")} win={t("dashboard.winOpen")}>
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
                      <span className="dash-ov">
                        {tc != null ? fmtComp(tc) : "—"}
                      </span>
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
      </div>

      <button
        className="btn-secondary overview-activity-toggle"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
      >
        {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
      </button>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}

      {/* Calendar folded in from its own tab (#481) — deadlines, interviews
          and applied dates in one place; the ICS feed stays in Settings. */}
      <h3 className="insights-cal-h">{t("tabs.calendar")}</h3>
      <CalendarTab onError={onError} onJump={onJump} />

      <details className="dash-details">
        <summary>{t("dashboard.allNumbers")}</summary>
        <StatsTab stats={stats} fullApps={fullApps} />
      </details>
    </section>
  );
}
