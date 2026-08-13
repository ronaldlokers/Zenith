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
  outcomeBreakdown,
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
import { FlagIcon, FunnelIcon, OfferIcon } from "./icons";
import {
  Button,
  DashCard,
  EmptyState,
  MomentumBand,
  Skeleton,
  StatCard,
} from "./components";

export function InsightsTab({
  applications,
  onGoToJobs,
  onOpenJob,
  onShowClosed,
  onError,
  onJump,
  stats,
}: {
  applications: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onShowClosed: () => void;
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
  const outcomes = outcomeBreakdown(history);
  const outcomeMax = Math.max(1, ...outcomes.counts.map((o) => o.count));
  const liveOffers = applications.filter((a) => a.status === "offer");
  const comps = liveOffers
    .map((o) => totalComp(o))
    .filter((x): x is number => x != null);
  const topComp = comps.length ? Math.max(...comps) : null;

  const fmtComp = (n: number) =>
    `~${liveOffers[0]?.salary_currency ?? "€"} ${Math.round(n).toLocaleString()}`;

  return (
    <section className="dash">
      {/* Nothing to report yet, said once. The page used to render its full
          chrome around an empty account: 0 open, 0% response over 0 of 0,
          0 live offers, a median of "—", a five-stage funnel of zeroes and
          a momentum verdict on no events — the first screen a newly invited
          user sees under a tab called Insights, and every number on it
          either zero or invented. A page whose only output is numbers has
          nothing to say before there are any, so it says that and points at
          the thing that starts the search. */}
      {applications.length === 0 ? (
        <EmptyState className="insights-empty">
          {t("insights.nothingYet")}{" "}
          <Button variant="link" onClick={onGoToJobs}>
            {t("insights.nothingYetCta")}
          </Button>
        </EmptyState>
      ) : (
        <>
      {/* The figures sit on one hairline band, divided rather than boxed:
          four tiles read as four things, where this reads as one summary. */}
      {/* Named for heading navigation. These two bands carry the page's
          headline numbers and its verdict, and neither had a heading at all
          — so skimming Insights by heading went straight past everything
          analytic and landed on the calendar. Visually hidden because the
          figures already label themselves on screen. */}
      <h2 className="sr-only">{t("insights.headlineNumbers")}</h2>
      <div className="dash-kpiband">
        <StatCard
          band
          hero
          value={open.length}
          label={t("dashboard.kpiOpenShort")}
          onClick={onGoToJobs}
        />
        <StatCard
          band
          value={`${Math.round(resp.rate * 100)}%`}
          label={t("dashboard.kpiResponseShort")}
          sub={t("dashboard.kpiResponseOf", {
            responded: resp.responded,
            applied: resp.applied,
          })}
          onClick={onGoToJobs}
        />
        <StatCard
          band
          value={liveOffers.length}
          label={t("dashboard.kpiOffers")}
          sub={topComp != null ? fmtComp(topComp) : undefined}
          onClick={() => liveOffers[0] && onOpenJob(liveOffers[0].id)}
        />
        <StatCard
          band
          value={t2o != null ? `~${Math.round(t2o)}d` : "—"}
          label={t("dashboard.kpiToOffer")}
        />
      </div>

      <h2 className="sr-only">{t("dashboard.momentumTitle")}</h2>
      <MomentumBand
        eyebrow={t("dashboard.momentumTitle")}
        verdict={t(`stats.momentum.${pipe.verdict}`)}
        detail={t("stats.momentumDetail", {
          // count drives the plural form; recent is what the sentence prints.
          count: pipe.recent,
          recent: pipe.recent,
          prior: pipe.prior,
        })}
        bars={mom.weeks.map((w) => ({
          heightPct: Math.max(4, (w.count / weekMax) * 100),
          dim: w.count === 0,
        }))}
      />

      <div className="dash-cols dash-cols-3">
        {/* Each stage is its own card, and its conversion is stated on it
            rather than as a row of bare percentages underneath — "35% from
            applied" is the sentence those numbers were always making. */}
        <DashCard
          column
          heading={`${t("dashboard.funnelConv")} (${counts[0] ?? 0})`}
          icon={<FunnelIcon />}
        >
          <div className="dash-funnel">
            {FUNNEL_STAGES.map((st, i) => (
              <div className={`dash-fn stage-${st}`} key={st}>
                <span className="dash-fl">
                  {t(`stages.${st}`)}
                  {/* Only when there is a rate to state. Below the
                      threshold the stage still shows its count — the number
                      is true, the percentage would not be. */}
                  {i > 0 && conv[i - 1]?.rate != null ? (
                    <span className="dash-fconv">
                      {t("dashboard.convFrom", {
                        pct: Math.round((conv[i - 1].rate ?? 0) * 100),
                        stage: t(`stages.${FUNNEL_STAGES[i - 1]}`),
                      })}
                    </span>
                  ) : null}
                </span>
                <span className="dash-fn-n">{counts[i]}</span>
                <span className="dash-fbar">
                  <i style={{ width: `${(counts[i] / funnelMax) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        </DashCard>

        {/* A reason is a phrase, not a one-word stage, so its card carries
            the label on its own line above the bar. */}
        <DashCard
          column
          heading={`${t("outcome.insightsTitle")} (${outcomes.total})`}
          icon={<FlagIcon />}
        >
          {outcomes.total === 0 ? (
            <p className="muted small dash-col-empty">
              {t("outcome.insightsEmpty")}
            </p>
          ) : (
            <>
              <div className="dash-funnel dash-outcome">
                {outcomes.counts.map(({ reason, count }) => (
                  <div className="dash-fn" key={reason}>
                    <span className="dash-fl">
                      {t(`outcome.reason.${reason}`)}
                    </span>
                    <span className="dash-fn-n">{count}</span>
                    <span className="dash-fbar">
                      <i style={{ width: `${(count / outcomeMax) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              {outcomes.unrecorded > 0 &&
                (outcomes.counts.length === 0 ? (
                  /* Nothing recorded at all, which is not the same as "and
                     also these". The column rendered a header, a count and
                     one grey sentence saying nothing was recorded, next to
                     two populated columns — a dead end where the only thing
                     that fixes it is somewhere else entirely. The reason is
                     recorded on the application itself, so this says so and
                     goes there. */
                  <p className="dash-col-empty">
                    <span className="muted small">
                      {t("outcome.insightsNoneRecorded", {
                        count: outcomes.unrecorded,
                      })}
                    </span>{" "}
                    <Button variant="link" onClick={onShowClosed}>
                      {t("outcome.insightsRecordCta")}
                    </Button>
                  </p>
                ) : (
                  <p className="dash-outcome-rest">
                    {t("outcome.insightsUnrecorded", {
                      count: outcomes.unrecorded,
                    })}
                  </p>
                ))}
            </>
          )}
        </DashCard>

        <DashCard
          column
          heading={`${t("dashboard.offers")} (${liveOffers.length})`}
          icon={<OfferIcon />}
        >
          {liveOffers.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {t("dashboard.noOffers")}
            </p>
          ) : (
            <>
            <ul className="dash-offers dash-offers-cards">
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
            <Button
              variant="secondary"
              wrap
              className="dash-offers-pdf"
              onClick={() => downloadOfferComparisonPdf(liveOffers, t)}
            >
              {t("stats.downloadOfferComparison")}
            </Button>
            </>
          )}
        </DashCard>
      </div>


      {/* Activity is a section of this screen like the ones above it, not a
          full-width button floating under them. */}
      <div className="insights-activity">
        <h2 className="ruled-h">{t("tabs.activity")}</h2>
        <Button
          variant="secondary"
          onClick={() => setShowActivity((v) => !v)}
          aria-expanded={showActivity}
        >
          {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
        </Button>
      </div>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}

      {/* Calendar folded in from its own tab (#481) — deadlines, interviews
          and applied dates in one place; the ICS feed stays in Settings. */}
      {wide ? (
        <>
          <h2 className="ruled-h insights-cal-h">{t("tabs.calendar")}</h2>
          <CalendarTab onError={onError} onJump={onJump} />
        </>
      ) : (
        <div className="insights-activity">
          <h2 className="ruled-h">{t("tabs.calendar")}</h2>
          <Button
            variant="secondary"
            onClick={() => setShowCalendar((v) => !v)}
            aria-expanded={showCalendar}
          >
            {showCalendar ? t("calendar.hide") : t("calendar.show")}
          </Button>
          {showCalendar && <CalendarTab onError={onError} onJump={onJump} />}
        </div>
      )}
        </>
      )}
    </section>
  );
}
