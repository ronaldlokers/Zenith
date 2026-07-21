// Shared UI primitives extracted from App.tsx (#285 split) — skeleton,
// load-failed, the Dialog + ConfirmHost modal stack, and the small hooks.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionBar, Button } from "./components";
import { setConfirmImpl, useFocusTrap } from "./hooks";

export function LoadingSkeleton() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}

// Shared dialog primitive (#314) — backdrop, focus trap, Escape, and
// aria-modal in one place instead of re-implemented per modal.
export function Dialog({
  label,
  onClose,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={`modal${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

// Terminal error state for a tab whose data fetch failed (#261). Without
// it, a failed load left the "Loading…" placeholder up forever while the
// only signal was the easy-to-miss top banner.
export function LoadFailed({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="load-error" role="alert">
      <p className="muted small">{t("common.loadError")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const [req, setReq] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  useEffect(() => {
    setConfirmImpl(
      (message) =>
        new Promise((resolve) =>
          setReq((prev) => {
            // A second confirm may fire while one is pending (#346); the
            // replaced caller must resolve (as "cancelled"), not hang forever.
            prev?.resolve(false);
            return { message, resolve };
          }),
        ),
    );
    return () => {
      setConfirmImpl((message) => Promise.resolve(window.confirm(message)));
    };
  }, []);
  const answer = (ok: boolean) => {
    setReq((cur) => {
      cur?.resolve(ok);
      return null;
    });
  };
  // Capture-phase Escape: the dialog may sit on top of another modal whose
  // own window-level Escape listener would otherwise close both at once.
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req]);
  if (!req) return null;
  return (
    <Dialog
      label={req.message}
      onClose={() => answer(false)}
      className="confirm-dialog"
    >
      <p>{req.message}</p>
      <ActionBar variant="form">
        <Button variant="danger" onClick={() => answer(true)}>
          {t("common.confirm")}
        </Button>
        <Button variant="secondary" type="button" onClick={() => answer(false)}>
          {t("common.cancel")}
        </Button>
      </ActionBar>
    </Dialog>
  );
}
