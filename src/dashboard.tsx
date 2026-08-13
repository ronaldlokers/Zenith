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
  isGoneQuiet,
  isOverdue,
  parseSqlDate,
  searchWeekNumber,
  STAGE_URGENCY,
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
  // null until the user picks a half, and the default follows the data
  // rather than being pinned to "due". Pinned, the panel opened on an empty
  // Due list whenever nothing was due, and the only thing that moved it was
  // clicking the hero — which made the hero a control that worked once and
  // was inert every press after, the same defect the due-state hero had.
  // Derived rather than an effect: an effect would render the wrong half
  // first and correct it, and the tab would also fight the user's choice
  // every time the data refetched.
  const [tabChoice, setTabChoice] = useState<"due" | "upcoming" | null>(null);

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
    .filter((a) => isGoneQuiet(a))
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
  // "Today" was doing two jobs. Every item in `due` is either late or due now,
  // and the hero called all of them "today" — so nine follow-ups running from
  // three weeks to nine days late were announced as today's work. Splitting
  // them lets the copy say what is true, which is also what the research on
  // task-app abandonment asks for: an overdue pile that is named honestly and
  // has a way out is survivable; one dressed up as today's list is not.
  // Plain derivations, not useMemo: they sit below the `if (!stats)` guard
  // above, and a hook after an early return changes hook order between
  // renders. Two filters over the due set (tens of rows, and the product is
  // specified around ~50 applications) cost nothing worth a hook.
  const overdue = due
    // Sorted, because the hero quotes the oldest date. `due` is in source
    // order, so indexing it for "oldest" would have named an arbitrary one.
    .filter((a) => isOverdue(a))
    .sort((a, b) =>
      (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""),
    );
  const dueToday = due.filter((a) => !isOverdue(a));

  const nextUpTab: "due" | "upcoming" =
    tabChoice ?? (due.length > 0 ? "due" : "upcoming");
  const setNextUpTab = setTabChoice;

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
            {/* The hero states what the screen is about — "9 follow-ups are
                late", "nothing due" — and it changes after every Done,
                Snooze and batch push. Without a live region a screen-reader
                user acts on a row, hears the toast, and is never told the
                thing the sighted user reads first has changed. polite, not
                assertive: it is a summary, and it must not cut across the
                toast that confirms the action itself. */}
            <div aria-live="polite">
            {heroState === "due" && (
              /* No onClick. It used to call setNextUpTab("due") while "due"
                 was already the tab — the largest, warmest target on the
                 screen, and pressing it changed nothing.

                 The label says which kind of work these are. Calling nine
                 follow-ups that ran late by up to three weeks "things need
                 you today" is the framing the research on task-app
                 abandonment warns about: a pile presented as today's list,
                 which the user learns not to open. Named honestly, with the
                 oldest date shown and a way to clear it below, it stays
                 survivable. */
              <StatCard
                hero
                className="today-hero"
                value={due.length}
                label={
                  overdue.length && dueToday.length
                    ? t("today.mixed", {
                        overdue: overdue.length,
                        today: dueToday.length,
                      })
                    : overdue.length
                      ? `${t("today.overdueOnly", { count: overdue.length })} · ${t(
                          "today.overdueSince",
                          {
                            date: formatDate(overdue[0].next_action_at!),
                          },
                        )}`
                      : t("today.needYou", { count: due.length })
                }
              />
            )}
            {heroState === "clear" && (
              <StatCard
                hero
                className="today-hero"
                value={upcoming.length}
                label={t("today.scheduledNoneDue", { count: upcoming.length })}
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

            </div>

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

          {/* One rail, not two columns. Both blocks are summaries read at
              a glance; as separate grid items their rows were sized by the
              task column spanning beside them, which opened a gap between
              them that the content never asked for. */}
          <div className="today-rail">
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

          {hadMovesThisWeek(stats, applications) && (
            <div className="today-col">
              <HappenedToday
                stats={stats}
                applications={applications}
                onOpenJob={onOpenJob}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </section>
  );
}

// "Happened today" reads a 24h window and "Moved this week" a 7d one over the
// same status_history rows, so today is a strict subset of the week: when the
// week is empty today cannot hold anything either, and the rail ended on two
// cards side by side each saying nothing changed. Two nulls read as two
// failures. The narrower one yields and the week's single line stands, which
// is both smaller and the more useful of the two statements. Mirrors
// ThisWeek's predicate exactly, app-exists filter included — a row whose
// application is missing shows in neither, so counting it here would keep an
// empty card alive next to an empty card.
function hadMovesThisWeek(stats: Stats, applications: Application[]): boolean {
  const since = Date.now() - 7 * DAY;
  return stats.history.some(
    (h) =>
      parseSqlDate(h.changed_at) >= since &&
      applications.some((a) => a.id === h.application_id),
  );
}

// What changed today, as sentences rather than a chart (#535 landing). Reads
// the same status_history rows the weekly momentum already uses, filtered to
// today: nothing new is fetched.
function HappenedToday({
  stats,
  applications,
  onOpenJob,
}: {
  stats: Stats;
  applications: Application[];
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const since = Date.now() - DAY;
  const moves = stats.history
    .filter((h) => parseSqlDate(h.changed_at) >= since)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .map((h) => ({ h, app: applications.find((a) => a.id === h.application_id) }))
    .filter((m): m is { h: StatusHistoryRow; app: Application } => !!m.app)
    .slice(0, 6);

  return (
    <section className="today-happened">
      <h2 className="col-h">
        {t("today.happened")} <span className="col-n">({moves.length})</span>
      </h2>
      {moves.length === 0 ? (
        <p className="muted small">{t("today.happenedNone")}</p>
      ) : (
        <ul className="today-happened-list">
          {moves.map(({ h, app }) => (
            <li key={`${h.application_id}-${h.changed_at}`}>
              <button className="today-happened-row" onClick={() => onOpenJob(app.id)}>
                <span className="today-happened-meta">
                  {app.company_name ?? "—"}
                </span>
                <span className="today-happened-say">
                  {h.from_status
                    ? t("today.happenedMoved", { title: app.title, stage: t(`stages.${h.to_status}`) })
                    : t("today.happenedAdded", { title: app.title })}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
  const [showAll, setShowAll] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Ranked by what is worth doing, not by what is oldest. Sorting on date
  // alone put a five-star offer at row four, tinted and buttoned exactly like
  // an unanswered cold application — the one thing in the pipeline that could
  // carry a hard week, filed as a chore. Stage leads (an offer outranks an
  // interested), then fit, then age. Date still breaks ties, so a queue of
  // same-stage follow-ups reads oldest-first the way it always did.
  const rows = (tab === "due" ? due : upcoming)
    .slice()
    .sort((a, b) => {
      const byStage = STAGE_URGENCY.indexOf(b.status) - STAGE_URGENCY.indexOf(a.status);
      if (byStage !== 0) return byStage;
      const byFit = (b.fit_score ?? 0) - (a.fit_score ?? 0);
      if (byFit !== 0) return byFit;
      return (a.next_action_at ?? "").localeCompare(b.next_action_at ?? "");
    });
  const visible = showAll ? rows : rows.slice(0, 6);

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

  // One way out of the pile. The research on task-app abandonment is blunt
  // about this: a list of seventeen overdue items costs more to open than to
  // ignore, and the app is then abandoned in week two or three. Enumerating
  // the debt is not enough — the screen has to be able to absorb it. Every
  // date is restored by a single undo, so this is a reversible act, not a
  // confession.
  // The verb the screen did not have. "Done" is a lie for an application
  // nobody ever replied to, and Snooze only defers it — so the pile could
  // only grow or be falsified, and the app's kindest sentence ("No reply is
  // on them, not you") lived in a block the overdue set can never reach:
  // isGoneQuiet requires no next_action_at, the due list requires one, so the
  // two sets are disjoint by construction.
  //
  // Sets the status rather than archiving, which is what the gone-quiet block
  // does. "ghosted" is terminal, so it writes a status_history row and the
  // outcome the Insights column asks for, and the board already has the rail.
  // Standard practice in trackers is exactly this rule: no response after a
  // couple of weeks becomes a closed-no-response state rather than an open
  // task nobody will ever action.
  const markNoReply = (a: Application) => {
    const prev = a.status;
    return Promise.resolve(api.setStatus(a.id, "ghosted"))
      .then(() => onChanged())
      .then(() =>
        notify(t("nextUp.noReplyToast"), () =>
          Promise.resolve(api.setStatus(a.id, prev))
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));
  };

  // What the batch escape is allowed to touch. An offer or an interview is
  // the thing that could end the search; the first run of this control would
  // have snoozed a five-star offer along with nine dead follow-ups, on one
  // tap, because it took everything overdue. Those two stages are the user's
  // to handle one at a time.
  const isPushable = (a: Application) =>
    isOverdue(a) && a.status !== "offer" && a.status !== "interview";

  const pushAllLate = () => {
    const late = rows.filter(isPushable);
    if (!late.length) return;
    const prev = late.map((a) => ({
      id: a.id,
      next_action: a.next_action ?? null,
      next_action_at: a.next_action_at ?? null,
    }));
    // Sequential, not Promise.all. This fires one write per late row with no
    // cap: at the ~50 applications the product is specified around, a bad
    // month is thirty parallel writes on one tap. `pushing` closes the other
    // half — a second tap before the first settled duplicated the work while
    // the undo closure still held the pre-first-tap state.
    setPushing(true);
    return late
      .reduce(
        (chain, a, i) =>
          chain.then(() =>
            api.updateFollowUp(a.id, {
              next_action: a.next_action ?? null,
          // Spread, not one date. Moving nine follow-ups to a single day
          // clears this screen and rebuilds the same pile as one cliff a week
          // out, which is worse than the pile it replaced — the point is to
          // make next week survivable, not to empty today. Two a day from
          // three days out, in the order the list is already ranked, so the
          // most urgent come back first.
              next_action_at: daysFromToday(3 + Math.floor(i / 2)),
            }),
          ),
        Promise.resolve<unknown>(undefined),
      )
      .then(() => onChanged())
      .then(() =>
        notify(t("today.pushedAll", { count: late.length }), () =>
          Promise.all(prev.map((r) => api.updateFollowUp(r.id, r)))
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message))
      .finally(() => setPushing(false));
  };

  const lateCount = rows.filter(isPushable).length;

  return (
    <section className="today-nextup">
      <div className="today-nextup-head">
        <h2 className="side-h">
          {t("nextUp.title")}{" "}
          {tab === "due" && (
            <span className="today-sortnote">{t("today.sortedBy")}</span>
          )}
        </h2>
        <SegmentedControl role="group" aria-label={t("nextUp.title")}>
          {/* Both switches clear the expansion. showAll had no collapse and
              was never reset, so expanding Due to forty rows left Upcoming
              expanded too, with no way back to six short of a remount. */}
          <SegmentedControl.Item
            active={tab === "due"}
            onClick={() => {
              setShowAll(false);
              onTab("due");
            }}
          >
            {t("nextUp.segDue", { count: due.length })}
          </SegmentedControl.Item>
          <SegmentedControl.Item
            active={tab === "upcoming"}
            onClick={() => {
              setShowAll(false);
              onTab("upcoming");
            }}
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
          {visible.map((a) => (
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
                {/* The action leads. This screen's whole premise is "what do
                    I do now?", and it used to answer "which job is late" —
                    next_action was populated, led the detail page, the board
                    card and the notification tray, and was the one thing the
                    row left out. Without it Done clears a follow-up the user
                    was never shown. */}
                <span className="side-title">
                  {a.next_action ?? a.title}
                </span>
                <span className="side-co">
                  {a.next_action ? `${a.title} · ` : ""}
                  {a.company_name ?? "—"}
                  {a.fit_score ? (
                    <span className="fit-stars">
                      {" "}
                      <StarRating value={a.fit_score} readOnly />
                    </span>
                  ) : null}
                </span>
                <span className="side-stage">{t(`stages.${a.status}`)}</span>
              </button>
              <span className="nextup-actions">
                {/* Six buttons in one list whose entire accessible name was
                    "Done" — serial navigation read "Done, button" six times
                    with nothing to tell them apart. The visible label stays
                    one word; the name carries the row. Likewise the menu,
                    which was labelled with the job title while the row's
                    visible primary text is the action. */}
                <Button
                  variant="secondary"
                  aria-label={t("nextUp.doneFor", { action: rowName(a) })}
                  onClick={() => done(a)}
                >
                  {t("nextUp.done")}
                </Button>
                <RowMenu
                  label={t("nextUp.actionsFor", { title: rowName(a) })}
                  items={[
                    {
                      label: t("nextUp.snooze3d"),
                      onSelect: () => void snooze(a, 3),
                    },
                    {
                      label: t("nextUp.snooze1w"),
                      onSelect: () => void snooze(a, 7),
                    },
                    ...(isOverdue(a)
                      ? [
                          {
                            label: t("nextUp.noReply"),
                            onSelect: () => void markNoReply(a),
                          },
                        ]
                      : []),
                  ]}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* The count and the list have to agree. The hero shouted a number the
          list then capped at six, with nothing to say three were missing and
          no way to reach them from the screen built to clear them. */}
      {rows.length > visible.length && (
        <button className="today-showall" onClick={() => setShowAll(true)}>
          {t("nextUp.showAll", { count: rows.length })}
        </button>
      )}
      {tab === "due" && lateCount > 1 && (
        /* A real button, and it says how many. This was a 10px muted caption
           with no border firing an unconfirmed write across every late row —
           the weakest control on the screen doing the largest thing on it. */
        <p className="today-pushall">
          <Button
            variant="secondary"
            disabled={pushing}
            onClick={() => void pushAllLate()}
          >
            {t("today.pushAll", { count: lateCount })}
          </Button>{" "}
          <span className="muted small">{t("today.pushAllKeeps")}</span>
        </p>
      )}
    </section>
  );
}

// What the row actually reads as, which is the action when there is one.
// Both accessible names use it, so neither can drift from the visible text.
const rowName = (a: Application) => a.next_action ?? a.title;

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
