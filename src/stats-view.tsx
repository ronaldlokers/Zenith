// Stats dashboard extracted from App.tsx (#285 split) — the full analytics
// view (funnel, conversion, time-in-stage, ghost rate, offer comparison,
// export) shown behind the Dashboard's "all the numbers" drawer.
import { useTranslation } from "react-i18next";
import { LoadingSkeleton } from "./ui";
import { Badge } from "./components";
import {
  funnelConversions,
  medianTimeInStageDays,
  responseRate,
} from "./stats";
import {
  annualizedComp,
  computeWeeklyMomentum,
  downloadOfferComparisonPdf,
  formatComp,
  median,
  parseSqlDate,
  PIPELINE,
  totalComp,
  totalCompBreakdown,
} from "./format";
import type { Application, Stats } from "./types";

const UNKNOWN_SOURCE = "__unknown_source__";

export function StatsTab({
  stats,
  fullApps,
}: {
  stats: Stats | null;
  fullApps: Application[];
}) {
  const { t } = useTranslation();
  if (!stats) return <LoadingSkeleton />;
  const { applications: apps, history } = stats;

  const comparing = (fullApps ?? [])
    .filter((a) => a.status === "interview" || a.status === "offer")
    .sort((a, b) => (annualizedComp(b) ?? -1) - (annualizedComp(a) ?? -1));

  // Applications per week + streak via the shared helper above.
  const now = Date.now();
  const { weeks } = computeWeeklyMomentum(apps, history);
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));

  // Furthest pipeline stage each application ever reached
  const reachedByApp = new Map<number, number>();
  for (const row of history) {
    const idx = PIPELINE.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reachedByApp.get(row.application_id) ?? -1;
    if (idx > prev) reachedByApp.set(row.application_id, idx);
  }
  const funnel = PIPELINE.map((stage, i) => ({
    stage,
    count: [...reachedByApp.values()].filter((r) => r >= i).length,
  }));
  const funnelMax = Math.max(1, funnel[0].count);

  // Average days spent per pipeline stage
  const stageDays = new Map<string, { total: number; n: number }>();
  const byApp = new Map<number, typeof history>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  for (const rows of byApp.values()) {
    for (let i = 0; i < rows.length; i++) {
      const stage = rows[i].to_status;
      if (!PIPELINE.includes(stage)) continue;
      const start = parseSqlDate(rows[i].changed_at);
      const end =
        i + 1 < rows.length ? parseSqlDate(rows[i + 1].changed_at) : now;
      const cur = stageDays.get(stage) ?? { total: 0, n: 0 };
      cur.total += (end - start) / 86400000;
      cur.n += 1;
      stageDays.set(stage, cur);
    }
  }

  // Time to offer (#226) — days from the "applied" transition to the
  // "offer" transition, per application that reached offer. Median
  // rather than mean since a single very slow (or very fast) employer
  // shouldn't skew a number meant to set expectations.
  const offerDurations: number[] = [];
  for (const rows of byApp.values()) {
    const appliedRow = rows.find((r) => r.to_status === "applied");
    const offerRow = rows.find((r) => r.to_status === "offer");
    if (appliedRow && offerRow) {
      const days =
        (parseSqlDate(offerRow.changed_at) - parseSqlDate(appliedRow.changed_at)) /
        86400000;
      if (days >= 0) offerDurations.push(days);
    }
  }
  const timeToOffer = median(offerDurations);

  // Ghost rate per source
  const bySource = new Map<string, { total: number; ghosted: number }>();
  for (const a of apps) {
    const src = a.source?.trim() || UNKNOWN_SOURCE;
    const cur = bySource.get(src) ?? { total: 0, ghosted: 0 };
    cur.total += 1;
    if (a.status === "ghosted") cur.ghosted += 1;
    bySource.set(src, cur);
  }

  // Pipeline velocity: forward stage advances (never backward/lateral) in
  // the last 14 days vs the 14 days before that — a single headline signal
  // for whether the search overall is speeding up or stalling, distinct
  // from the per-stage funnel/time-in-stage breakdowns below.
  const PERIOD = 14 * 86400000;
  const isForwardMove = (row: (typeof history)[number]) => {
    const toIdx = PIPELINE.indexOf(row.to_status);
    const fromIdx = row.from_status ? PIPELINE.indexOf(row.from_status) : -1;
    return toIdx >= 0 && toIdx > fromIdx;
  };
  const recentMoves = history.filter(
    (h) => isForwardMove(h) && parseSqlDate(h.changed_at) >= now - PERIOD,
  ).length;
  const priorMoves = history.filter(
    (h) =>
      isForwardMove(h) &&
      parseSqlDate(h.changed_at) >= now - 2 * PERIOD &&
      parseSqlDate(h.changed_at) < now - PERIOD,
  ).length;
  let momentum: "up" | "down" | "flat" | "none";
  if (recentMoves === 0 && priorMoves === 0) momentum = "none";
  else if (priorMoves === 0) momentum = "up";
  else {
    const change = (recentMoves - priorMoves) / priorMoves;
    momentum = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
  }

  // Stats v2 (#275) — conversion, response rate, median time-in-stage,
  // computed by the pure helpers in stats.ts.
  const conversions = funnelConversions(history);
  const response = responseRate(history);
  const medianStage = new Map(
    medianTimeInStageDays(history, now).map((s) => [s.stage, s.median]),
  );

  return (
    <section className="stats">
      <div className={`momentum momentum-${momentum}`}>
        <span className="momentum-label">{t("stats.momentumLabel")}</span>
        <span className="momentum-value">{t(`stats.momentum.${momentum}`)}</span>
        <span className="muted small">
          {t("stats.momentumDetail", { recent: recentMoves, prior: priorMoves })}
        </span>
      </div>

      <div className="stats-grid">
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.appsPerWeek")}</h2>
      <div className="histo">
        {weeks.map((w) => (
          <div key={w.label} className="hrow" title={t("stats.weekOfTitle", { label: w.label, count: w.count })}>
            <span className="lbl">{w.label}</span>
            <span className="htrack">
              <span
                className="hfill accent-fill"
                style={{ width: `${(w.count / weekMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{w.count}</span>
          </div>
        ))}
      </div>

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.pipelineFunnel")}</h2>
      <div className="histo">
        {funnel.map((f) => (
          <div
            key={f.stage}
            className={`hrow stage-${f.stage}`}
            title={t("stats.reachedTitle", { count: f.count, stage: t(`stages.${f.stage}`) })}
          >
            <span className="lbl">{t(`stages.${f.stage}`)}</span>
            <span className="htrack">
              <span
                className="hfill"
                style={{ width: `${(f.count / funnelMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{f.count}</span>
          </div>
        ))}
      </div>

      </div>
      <div className="stat-block">
      {response.applied > 0 && (
        <p className="stat-callout">
          {t("stats.responseRate", {
            responded: response.responded,
            applied: response.applied,
            pct: Math.round(response.rate * 100),
          })}
        </p>
      )}

      {conversions.some((c) => c.prev > 0) && (
        <>
          <h2 className="stat-h">{t("stats.conversion")}</h2>
          <ul className="stat-list">
            {conversions
              .filter((c) => c.prev > 0)
              .map((c) => (
                <li key={`${c.from}-${c.to}`} className={`stage-${c.to}`}>
                  <span className="stat-dot" aria-hidden="true" />
                  <span className="stage-name">
                    {t(`stages.${c.from}`)} → {t(`stages.${c.to}`)}
                  </span>
                  <span className="stat-val">{Math.round(c.rate * 100)}%</span>
                </li>
              ))}
          </ul>
        </>
      )}

      {timeToOffer != null && (
        <p className="stat-callout">
          {t("stats.timeToOffer", { count: Math.round(timeToOffer), n: offerDurations.length })}
        </p>
      )}

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.avgTimeInStage")}</h2>
      <ul className="stat-list">
        {PIPELINE.filter((s) => stageDays.has(s)).map((s) => {
          const d = stageDays.get(s)!;
          const med = medianStage.get(s);
          return (
            <li key={s} className={`stage-${s}`}>
              <span className="stat-dot" aria-hidden="true" />
              <span className="stage-name">{t(`stages.${s}`)}</span>
              <span className="stat-val">
                {(d.total / d.n).toFixed(1)}d {t("stats.avgLabel")}
                {med != null
                  ? ` · ${med.toFixed(1)}d ${t("stats.medianLabel")}`
                  : ""}
              </span>
            </li>
          );
        })}
        {stageDays.size === 0 && <li className="tl-empty">{t("stats.noHistory")}</li>}
      </ul>

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.ghostRate")}</h2>
      <ul className="stat-list">
        {[...bySource.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([src, v]) => (
            <li key={src}>
              <span>{src === UNKNOWN_SOURCE ? t("stats.unknownSource") : src}</span>
              <span className="muted small">{v.total} apps</span>
              <span className="stat-val">
                {t("stats.ghostedPercent", { pct: Math.round((v.ghosted / v.total) * 100) })}
              </span>
            </li>
          ))}
        {bySource.size === 0 && <li className="tl-empty">{t("stats.noApplications")}</li>}
      </ul>

      </div>
      <div className="stat-block stat-block-wide">
      <h2 className="stat-h">{t("stats.compare")}</h2>
      {comparing.some((a) => a.status === "offer") && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadOfferComparisonPdf(comparing.filter((a) => a.status === "offer"), t)}
        >
          {t("stats.downloadOfferComparison")}
        </button>
      )}
      <div className="compare-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>{t("stats.colRole")}</th>
              <th>{t("stats.colCompany")}</th>
              <th>{t("stats.colStage")}</th>
              <th>{t("stats.colComp")}</th>
              <th>{t("offer.totalComp")}</th>
              <th>{t("stats.colNotes")}</th>
            </tr>
          </thead>
          <tbody>
            {comparing.map((a) => {
              const total = totalComp(a);
              return (
                <tr key={a.id} className={`stage-${a.status}`}>
                  <td>{a.title}</td>
                  <td>{a.company_name ?? "—"}</td>
                  <td>
                    <Badge variant="stage">{t(`stages.${a.status}`)}</Badge>
                  </td>
                  <td className="compare-comp">{formatComp(a)}</td>
                  <td className="compare-comp" title={totalCompBreakdown(a)}>
                    {total != null
                      ? `~${a.salary_currency ?? ""} ${Math.round(total).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="compare-notes">{a.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {comparing.length === 0 && (
          <p className="tl-empty">{t("stats.compareEmpty")}</p>
        )}
      </div>

      <h2 className="stat-h">{t("stats.exportData")}</h2>
      <p className="export-links">
        <a href="/api/export" download>
          {t("stats.exportAllJson")}
        </a>
        {["applications", "companies", "contacts", "interactions"].map(
          (res) => (
            <a key={res} href={`/api/export/${res}.csv`} download>
              {res} (CSV)
            </a>
          ),
        )}
      </p>
      </div>
      </div>
    </section>
  );
}

