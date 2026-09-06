// App-level controller hooks, extracted from App.tsx (shell split). These
// own the cross-cutting data + toast state that every tab reads through
// props; no React components here, so react-refresh stays satisfied.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { TFunction } from "i18next";
import { api } from "./api";
import { isDead } from "./format";
import {
  isTerminalStatus,
  type Application,
  type Company,
  type Contact,
  type RoleTypeDef,
  type UserGoal,
  type Stats,
  type Status,
  type TerminalStatus,
} from "./types";

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
  label?: string;
}

export type Notify = (
  message: string,
  undo?: () => void,
  label?: string,
) => void;

// The toast queue + notify(), lifted out of App. A queue rather than a
// single slot (#346): a second notify used to erase a live undo window
// before its 6s elapsed. Cap the stack so a burst can't tower.
//
// The cap dropped the oldest, and the oldest is often the one that matters.
// Delete an application and move three cards on the board inside the six
// seconds — each move notifies — and the Undo was pushed off the stack while
// deleteWithUndo's timer kept running: the delete committed with the only way
// back already gone from the screen.
//
// So a toast carrying an undo is not interchangeable with one reporting
// something that already happened, and eviction takes the oldest toast
// without one first. If every toast on the stack carries an undo the oldest
// still goes — there is nothing better to drop, and letting the stack grow
// would be the tower the cap exists to prevent.
const MAX_TOASTS = 3;
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback<Notify>((message, undo, label) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => {
      const next = [...cur, { id, message, undo, label }];
      if (next.length <= MAX_TOASTS) return next;
      const informational = next.findIndex((toast) => !toast.undo);
      const drop = informational === -1 ? 0 : informational;
      return [...next.slice(0, drop), ...next.slice(drop + 1)];
    });
    window.setTimeout(
      () => setToasts((cur) => cur.filter((t) => t.id !== id)),
      undo ? 6000 : 3000,
    );
  }, []);
  const dismiss = useCallback(
    (id: number) => setToasts((cur) => cur.filter((t) => t.id !== id)),
    [],
  );
  return { toasts, notify, dismiss };
}

// The app's data layer: the five resource fetches behind one reload, plus
// the delete-with-undo and optimistic status mutations and the visibility
// filters every tab reads. Threads notify/navigate/t in from App since
// those come from React context there.
export function useAppData(
  notify: Notify,
  navigate: NavigateFunction,
  t: TFunction,
) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [statsData, setStatsData] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleTypeDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Distinct from `error`, which any failed mutation also sets. This one says
  // "the app has no data because the load did not happen", which is the only
  // condition under which a screen must not draw its empty state: a board
  // that failed to load rendered "Nothing tracked yet" over an account with
  // fifteen applications in it.
  //
  // Only the first load can set it. reload() also runs after mutations, and a
  // refresh that fails on top of a view that already has data must leave that
  // view alone — replacing a working board with a retry screen would be a
  // worse failure than the one it is reporting.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadedOnce = useRef(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Fetched with the rest, not per tab. DashboardTab used to ask for this in
  // its own effect, and it unmounts on every tab switch — so returning to
  // Overview re-read the same single row through the session middleware every
  // time. undefined means "not answered yet", which is different from a user
  // who has no goal set.
  const [goal, setGoal] = useState<UserGoal | null | undefined>(undefined);

  // Mirrors `applications` for callbacks that need to read the current rows
  // without being invalidated by them. Assigned during render rather than in
  // an effect: a callback fired between render and effect would otherwise read
  // the previous array.
  const appsRef = useRef(applications);
  appsRef.current = applications;

  const reload = useCallback(async () => {
    try {
      const [apps, comps, conts, roles, st, g] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
        api.roleTypes(),
        // One stats fetch for the whole app (#314) — Overview's momentum,
        // the Pipeline's attention heat, and the Stats tab all read it.
        api.stats(),
        // Tolerated separately: a goal that fails to load costs one block on
        // Overview, and failing the whole reload for it would blank the board.
        api.goals().catch(() => null),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setRoleTypes(roles);
      setStatsData(st);
      setGoal(g);
      setError(null);
      setLoadFailed(false);
      loadedOnce.current = true;
    } catch (e) {
      setError((e as Error).message);
      if (!loadedOnce.current) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Everything a company or contact edit can change, and nothing else.
  //
  // onChanged={reload} was wired to every tab, so saving a company name cost
  // the same five fetches — at least eight D1 statements — as a cold start.
  // D1 bills row reads, which makes that the amplification worth removing
  // before there is more than one user.
  //
  // Safe rather than merely narrower: /api/stats reads applications' status
  // columns, status_history and interactions, and neither of these two tabs
  // touches any of them — they create and edit companies and contacts and
  // nothing else. Role types have no mutation call site anywhere in src.
  //
  // applications is still refetched, because the list carries the joined
  // company and contact names: renaming a company does change what the board
  // shows, and leaving it stale would be a worse bug than the cost this saves.
  const reloadNetwork = useCallback(async () => {
    try {
      const [apps, comps, conts] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Stats-only refresh (perf review, #446). A kanban drag optimistically
  // updates the application locally, so the only thing it still needs from the
  // server is the recomputed stats — refetching all five resources on every
  // drag was the app's most frequent redundant network cost.
  const refreshStats = useCallback(() => {
    return api
      .stats()
      .then(setStatsData)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Detect only when nothing is stored. Re-detecting on every load would
  // silently overwrite a deliberate choice the moment the user travels or
  // connects through a VPN, which is the one thing the setting exists to allow.
  // Best-effort end to end: offline, a 500, or a session that expired between
  // load and this call must leave the app indistinguishable from one where
  // the user already had a zone stored, not surface a console error.
  useEffect(() => {
    void api
      .getPreferences()
      .then((prefs) => {
        if (prefs.timezone) return;
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) void api.setTimezone(detected).catch(() => {});
      })
      .catch(() => {});
  }, []);

  // Delete with an undo window: hide immediately, commit after the
  // toast expires unless undone (cascaded data survives an undo).
  const deleteWithUndo = useCallback(
    (resource: string, id: number, name: string) => {
      const key = `${resource}:${id}`;
      setHidden((h) => new Set(h).add(key));
      const timer = window.setTimeout(() => {
        api
          .remove(resource, id)
          .then(reload)
          .catch((e) => setError((e as Error).message))
          .finally(() =>
            setHidden((h) => {
              const next = new Set(h);
              next.delete(key);
              return next;
            }),
          );
      }, 6000);
      notify(t("toast.deleted", { name }), () => {
        window.clearTimeout(timer);
        setHidden((h) => {
          const next = new Set(h);
          next.delete(key);
          return next;
        });
      });
    },
    [notify, reload, t],
  );

  // Set when a move lands on a terminal stage (#381); App renders the
  // outcome dialog off it. Null whenever nothing is being asked.
  const [outcomePrompt, setOutcomePrompt] = useState<{
    id: number;
    status: TerminalStatus;
  } | null>(null);

  // Optimistic status change: update locally, revert on API failure
  const setStatus = useCallback(
    (id: number, status: Status) => {
      // From a ref, not the closure. This is the only reason setStatus needed
      // `applications` in its dep array, and that made a callback threaded to
      // every tab change identity on every data change — so nothing keyed on
      // it could skip a render. Same shape as the visible* arrays memoised in
      // #702; fixing one and not the other leaves the boundary just as leaky.
      const before = appsRef.current.find((a) => a.id === id);
      const prevStatus = before?.status;
      // Optimistically stamp updated_at too so "Recently updated" ordering
      // stays correct without a full reload (perf review, #446).
      const now = new Date().toISOString();
      setApplications((apps) =>
        apps.map((a) => (a.id === id ? { ...a, status, updated_at: now } : a)),
      );
      api
        .setStatus(id, status)
        .then(refreshStats)
        .then(() => {
          if (prevStatus == null || prevStatus === status) return;
          if (status === "offer") {
            // The comp fields (and everything they unlock — compare,
            // benchmark, negotiation draft) only matter now; surface the
            // entry path instead of leaving it to a status-order dance.
            notify(
              t("offer.recordPrompt"),
              () => navigate(`/board/${id}`),
              t("toast.open"),
            );
          } else if (isDead(prevStatus) && !isDead(status)) {
            notify(
              t("toast.revived"),
              () => navigate(`/board/${id}`),
              t("toast.setFollowUp"),
            );
          } else if (isTerminalStatus(status)) {
            // Ask why instead of the usual undo toast (#381). The two would
            // compete for the same moment, and the dialog is the stronger
            // surface: it is already about this move, and a mis-drop is
            // undone by dragging the card back — one gesture either way.
            setOutcomePrompt({ id, status });
          } else {
            notify(t("toast.statusChanged", { stage: t(`stages.${status}`) }), () =>
              api
                .setStatus(id, prevStatus)
                .then(reload)
                .catch((e) => setError((e as Error).message)),
            );
          }
        })
        .catch((e) => {
          // Only this row. Restoring the whole array would discard any other
          // move made in the same render — two quick drags share this closure,
          // so the second card's already-saved change went back with the first
          // card's failure and nothing said so.
          if (before) {
            setApplications((apps) =>
              apps.map((a) => (a.id === id ? { ...a, ...before } : a)),
            );
          }
          setError((e as Error).message);
        });
    },
    [reload, refreshStats, notify, navigate, t],
  );

  // Writes the outcome onto the application's latest terminal transition and
  // refreshes stats, since the Insights breakdown reads straight off the
  // history rows. Shared by the prompt dialog and the detail-page edit.
  const saveOutcome = useCallback(
    (id: number, reason: string | null, note: string | null) =>
      api
        .setOutcome(id, reason, note)
        .then(refreshStats)
        .catch((e) => setError((e as Error).message)),
    [refreshStats],
  );

  // Memoised because the whole app is keyed on these four. As bare filters
  // they were a new array on every render, which made App's
  // useMemo(..., [visibleApps]) recompute unconditionally — a memo that reads
  // as an optimisation and never hits. Nothing downstream could skip work
  // either, and the toast queue lives in the same component, so a toast
  // appearing and expiring three seconds later re-rendered the whole tree
  // twice and board.tsx redid its history aggregation both times.
  //
  // Correctness is unchanged: the filters were always right, just never the
  // same object twice.
  const visibleApps = useMemo(
    () => applications.filter((a) => !hidden.has(`applications:${a.id}`)),
    [applications, hidden],
  );
  // Archived applications keep contributing to Stats history but are
  // hidden from the active pipeline views (header count, Board, Next up).
  const activeApps = useMemo(
    () => visibleApps.filter((a) => !a.archived_at),
    [visibleApps],
  );
  const visibleCompanies = useMemo(
    () => companies.filter((c) => !hidden.has(`companies:${c.id}`)),
    [companies, hidden],
  );
  const visibleContacts = useMemo(
    () => contacts.filter((c) => !hidden.has(`contacts:${c.id}`)),
    [contacts, hidden],
  );

  return {
    applications,
    setApplications,
    statsData,
    companies,
    contacts,
    roleTypes,
    error,
    setError,
    loading,
    loadFailed,
    reload,
    reloadNetwork,
    goal,
    deleteWithUndo,
    setStatus,
    outcomePrompt,
    setOutcomePrompt,
    saveOutcome,
    visibleApps,
    activeApps,
    visibleCompanies,
    visibleContacts,
  };
}
