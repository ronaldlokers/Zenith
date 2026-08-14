import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// The CV sections deleted straight through api.remove: one tap in a ⋯ menu,
// directly below Edit, and a job was gone from the CV with no confirmation
// and no way back. Everywhere else in the app — applications, companies,
// contacts — a delete hides the row, waits, and offers an undo
// (app-data.ts's deleteWithUndo). The CV was the exception, and it holds the
// records that are hardest to reconstruct.
//
// It is a separate implementation rather than the shared one because the CV
// page owns its own data: deleteWithUndo hides by key inside useAppData and
// commits with useAppData's reload, neither of which reaches here. The
// semantics are deliberately identical, including the 6s window, so the two
// behave the same way from the outside.
const UNDO_WINDOW_MS = 6000;

export function useDeleteWithUndo(
  resource: string,
  onChanged: () => Promise<unknown>,
  onError: (message: string | null) => void,
  notify: (message: string, undo?: () => void) => void,
) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, number>());

  // A delete still pending when this unmounts would fire against a component
  // that is gone, and its undo would have left the screen with the row still
  // hidden. Cancelling is the honest outcome: nothing was committed.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const unhide = useCallback((id: number) => {
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });
  }, []);

  const remove = useCallback(
    (id: number, name: string) => {
      setHidden((h) => new Set(h).add(id));
      const timer = window.setTimeout(() => {
        timers.current.delete(id);
        api
          .remove(resource, id)
          .then(onChanged)
          .catch((e) => onError((e as Error).message))
          .finally(() => unhide(id));
      }, UNDO_WINDOW_MS);
      timers.current.set(id, timer);
      notify(t("toast.deleted", { name }), () => {
        window.clearTimeout(timer);
        timers.current.delete(id);
        unhide(id);
      });
    },
    [notify, onChanged, onError, resource, t, unhide],
  );

  return { hidden, remove };
}
