// Stats v2 metrics (#275) — pure, dependency-free functions over the
// /api/stats payload (applications + status_history), so they're unit
// testable without a DOM or DB. Terminal states (rejected/withdrawn/
// ghosted) are excluded: these measure forward progress through the funnel.
import type { Status, StatusHistoryRow } from "./types";

export const FUNNEL_STAGES: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

function sqlMs(d: string): number {
  return new Date(d.replace(" ", "T") + "Z").getTime();
}

// Furthest funnel stage index each application ever reached.
function reachedIndexByApp(history: StatusHistoryRow[]): Map<number, number> {
  const reached = new Map<number, number>();
  for (const row of history) {
    const idx = FUNNEL_STAGES.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reached.get(row.application_id) ?? -1;
    if (idx > prev) reached.set(row.application_id, idx);
  }
  return reached;
}

// How many applications ever reached each funnel stage (index i = reached
// stage i or further).
export function funnelReachCounts(history: StatusHistoryRow[]): number[] {
  const reached = [...reachedIndexByApp(history).values()];
  return FUNNEL_STAGES.map((_, i) => reached.filter((r) => r >= i).length);
}

export interface Conversion {
  from: Status;
  to: Status;
  prev: number;
  count: number;
  rate: number; // count / prev, or 0 when prev === 0
}

// Stage-to-stage conversion: of the apps that reached stage N, the
// fraction that went on to reach stage N+1.
export function funnelConversions(history: StatusHistoryRow[]): Conversion[] {
  const counts = funnelReachCounts(history);
  const out: Conversion[] = [];
  for (let i = 1; i < FUNNEL_STAGES.length; i++) {
    const prev = counts[i - 1];
    const count = counts[i];
    out.push({
      from: FUNNEL_STAGES[i - 1],
      to: FUNNEL_STAGES[i],
      prev,
      count,
      rate: prev > 0 ? count / prev : 0,
    });
  }
  return out;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface StageTiming {
  stage: Status;
  median: number;
  n: number;
}

// Median days spent in each funnel stage — the transition into a stage to
// the next transition (or `nowMs` for the current stage). Median over mean
// so a single very slow employer doesn't skew the number.
export function medianTimeInStageDays(
  history: StatusHistoryRow[],
  nowMs: number,
): StageTiming[] {
  const byApp = new Map<number, StatusHistoryRow[]>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  const perStage = new Map<Status, number[]>();
  for (const rows of byApp.values()) {
    for (let i = 0; i < rows.length; i++) {
      const stage = rows[i].to_status;
      if (!FUNNEL_STAGES.includes(stage)) continue;
      const start = sqlMs(rows[i].changed_at);
      const end = i + 1 < rows.length ? sqlMs(rows[i + 1].changed_at) : nowMs;
      const days = (end - start) / 86400000;
      if (days < 0) continue;
      const list = perStage.get(stage) ?? [];
      list.push(days);
      perStage.set(stage, list);
    }
  }
  const out: StageTiming[] = [];
  for (const stage of FUNNEL_STAGES) {
    const xs = perStage.get(stage);
    if (!xs || xs.length === 0) continue;
    out.push({ stage, median: median(xs)!, n: xs.length });
  }
  return out;
}

export interface ResponseRate {
  applied: number;
  responded: number;
  rate: number;
}

// Of applications that reached "applied", the fraction that advanced to
// "screening" or beyond — i.e. got a real response rather than silence.
export function responseRate(history: StatusHistoryRow[]): ResponseRate {
  const reached = [...reachedIndexByApp(history).values()];
  const appliedIdx = FUNNEL_STAGES.indexOf("applied");
  const screeningIdx = FUNNEL_STAGES.indexOf("screening");
  const applied = reached.filter((r) => r >= appliedIdx).length;
  const responded = reached.filter((r) => r >= screeningIdx).length;
  return { applied, responded, rate: applied > 0 ? responded / applied : 0 };
}
