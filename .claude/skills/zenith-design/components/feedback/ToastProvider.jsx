import React from "react";
import { Toast } from "./Toast.jsx";

// Zenith toast provider — imperative toasts without local state plumbing. Wrap
// the app in <ToastProvider>, then call const toast = useToast(); toast.success(
// "Saved"). Stacks bottom-right; auto-dismiss with a default duration.
const ToastCtx = React.createContext(null);

export function ToastProvider({ children, duration = 4000, placement = "bottom-right" }) {
  const [toasts, setToasts] = React.useState([]);
  const remove = React.useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = React.useCallback((kind, title, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, title, message, duration: opts.duration ?? duration }]);
    return id;
  }, [duration]);
  const api = React.useMemo(() => ({
    show: (o) => push(o.kind || "info", o.title, o.message, o),
    success: (title, message, o) => push("success", title, message, o),
    info: (title, message, o) => push("info", title, message, o),
    warning: (title, message, o) => push("warning", title, message, o),
    danger: (title, message, o) => push("danger", title, message, o),
    dismiss: remove,
  }), [push, remove]);
  const pos = {
    "bottom-right": { bottom: 20, right: 20, alignItems: "flex-end" },
    "bottom-left": { bottom: 20, left: 20, alignItems: "flex-start" },
    "top-right": { top: 20, right: 20, alignItems: "flex-end" },
    "top-left": { top: 20, left: 20, alignItems: "flex-start" },
  }[placement];
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position: "fixed", zIndex: 2000, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none", ...pos }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <Toast kind={t.kind} title={t.title} message={t.message} duration={t.duration} onDismiss={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
