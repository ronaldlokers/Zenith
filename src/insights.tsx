// Insights tab (#480) — the analytics that used to sit on the dashboard home.
// Moved off the daily "Today" screen so the home answers "what do I do now?"
// while the numbers live here for when you want them. KPIs, weekly momentum,
// funnel/conversion, live offers, activity and the calendar. The old "all the
// numbers" drawer is gone (#486) — it duplicated the cards above it and its
// only unique piece, data export, now lives in Settings → Data (#485).
import { useEffect, useState } from "react";
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
  downloadOfferComparisonPdf,
  isDead,
  medianTimeToOffer,
  totalComp,
} from "./format";
import { ActivityTab, CalendarTab } from "./calendar";
import { DashCard, MomentumBand, Skeleton, StatCard } from "./components";

export function InsightsTab({
  applications,
  onGoToJobs,
  onOpenJob,
  onError,
  onJump,
  stats,
}: {
  applications: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onJump: (title: string) => void;
  stats: Stats | null;
}) {
  const { t } = useTranslation();
  const [showActivity, setShowActivity] = useState(false);
  // The calendar only draws its month grid from 900px up; below that it falls
  // back to a full agenda list, which on a phone buried the numbers under a
  // scroll of every dated event. So on narrow screens it hides behind a
  // toggle — same 900px breakpoint the grid itself uses (#487).
  const [wide, setWide] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  const [showCalendar, setShowCalendar] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  if (!stats) return <Skeleton />;
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
            <>
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
            {/* The side-by-side offer PDF used to live in the retired "all the
                numbers" drawer (#486) — it is the one thing there that wasn't
                already on this screen, so it moves onto the offers card. */}
            <button
              type="button"
              className="btn-secondary dash-offers-pdf"
              onClick={() => downloadOfferComparisonPdf(liveOffers, t)}
            >
              {t("stats.downloadOfferComparison")}
            </button>
            </>
          )}
        </DashCard>
      </div>

      <button
        className="btn-secondary insights-toggle"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
      >
        {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
      </button>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}

      {/* Calendar folded in from its own tab (#481) — deadlines, interviews
          and applied dates in one place; the ICS feed stays in Settings. */}
      {wide ? (
        <>
          <h3 className="insights-cal-h">{t("tabs.calendar")}</h3>
          <CalendarTab onError={onError} onJump={onJump} />
        </>
      ) : (
        <>
          <button
            className="btn-secondary insights-toggle"
            onClick={() => setShowCalendar((v) => !v)}
            aria-expanded={showCalendar}
          >
            {showCalendar ? t("calendar.hide") : t("calendar.show")}
          </button>
          {showCalendar && <CalendarTab onError={onError} onJump={onJump} />}
        </>
      )}
    </section>
  );
}
