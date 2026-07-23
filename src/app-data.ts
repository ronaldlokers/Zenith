// App-level controller hooks, extracted from App.tsx (shell split). These
// own the cross-cutting data + toast state that every tab reads through
// props; no React components here, so react-refresh stays satisfied.
import { useCallback, useEffect, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { TFunction } from "i18next";
import { api } from "./api";
import { isDead } from "./format";
import {
  type Application,
  type Company,
  type Contact,
  type RoleTypeDef,
  type Stats,
  type Status,
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
// before its 6s elapsed. Cap the stack so a burst can't tower; oldest
// drops first.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback<Notify>((message, undo, label) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, message, undo, label }].slice(-3));
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
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      const [apps, comps, conts, roles, st] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
        api.roleTypes(),
        // One stats fetch for the whole app (#314) — Overview's momentum,
        // the Pipeline's attention heat, and the Stats tab all read it.
        api.stats(),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setRoleTypes(roles);
      setStatsData(st);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
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

  // Optimistic status change: update locally, revert on API failure
  const setStatus = useCallback(
    (id: number, status: Status) => {
      const prev = applications;
      const prevStatus = applications.find((a) => a.id === id)?.status;
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
              () => navigate(`/jobs/${id}`),
              t("toast.open"),
            );
          } else if (isDead(prevStatus) && !isDead(status)) {
            notify(
              t("toast.revived"),
              () => navigate(`/jobs/${id}`),
              t("toast.setFollowUp"),
            );
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
          setApplications(prev);
          setError((e as Error).message);
        });
    },
    [applications, reload, refreshStats, notify, navigate, t],
  );

  const visibleApps = applications.filter(
    (a) => !hidden.has(`applications:${a.id}`),
  );
  // Archived applications keep contributing to Stats history but are
  // hidden from the active pipeline views (header count, Board, Next up).
  const activeApps = visibleApps.filter((a) => !a.archived_at);
  const visibleCompanies = companies.filter(
    (c) => !hidden.has(`companies:${c.id}`),
  );
  const visibleContacts = contacts.filter(
    (c) => !hidden.has(`contacts:${c.id}`),
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
    reload,
    deleteWithUndo,
    setStatus,
    visibleApps,
    activeApps,
    visibleCompanies,
    visibleContacts,
  };
}
