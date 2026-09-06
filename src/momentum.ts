// The pipeline order and the two things that read it by date. Kept apart from
// format.ts so the Worker can import it: format.ts touches localStorage and
// pulls in the PDF helper, neither of which exists in workerd.
//
// This module is the single source for the momentum verdict. The public share
// page used to carry its own copy of the ratio and had never picked up the
// small-n floor below, so a single stage advance told a stranger the search
// was speeding up.
import type { Status } from "./types.js";

export const PIPELINE: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

export function parseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

// Six forward moves across four weeks — roughly one a week — is the least
// that makes a fortnight-over-fortnight ratio mean anything here.
export const MOMENTUM_MIN_EVENTS = 6;

export function computePipelineMomentum(history: { from_status: string | null; to_status: string; changed_at: string }[]) {
  const now = Date.now();
  const P = 14 * 86400000;
  const fwd = (r: { from_status: string | null; to_status: string }) => {
    const to = PIPELINE.indexOf(r.to_status as Status);
    const from = r.from_status ? PIPELINE.indexOf(r.from_status as Status) : -1;
    return to >= 0 && to > from;
  };
  const recent = history.filter(
    (h) => fwd(h) && parseSqlDate(h.changed_at) >= now - P,
  ).length;
  const prior = history.filter(
    (h) =>
      fwd(h) &&
      parseSqlDate(h.changed_at) >= now - 2 * P &&
      parseSqlDate(h.changed_at) < now - P,
  ).length;
  let verdict: "up" | "down" | "flat" | "none" | "early";
  if (recent === 0 && prior === 0) verdict = "none";
  // Below this many events in the window, a ratio is noise wearing a
  // verdict's clothes. Two fortnights of one or two stage advances is what a
  // normal search looks like — and at prior = 1, a single extra move reads
  // as +100% "speeding up" while one fewer reads as a collapse. The old code
  // called prior === 0 with any recent movement "speeding up", which is the
  // most confident thing this function could say off the least evidence.
  //
  // A job hunt is mostly flat by nature and mostly read on a bad day, so the
  // default has to be silence until the signal clears the noise rather than
  // a grade computed from a delta of one.
  else if (recent + prior < MOMENTUM_MIN_EVENTS) verdict = "early";
  else if (prior === 0) verdict = "up";
  else {
    const change = (recent - prior) / prior;
    verdict = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
  }
  return { verdict, recent, prior };
}
