import React from "react";
import { Modal } from "./Modal.jsx";
import { Button } from "../core/Button.jsx";

// Zenith modal provider — imperative dialogs & confirms without local state. Wrap
// the app in <ModalProvider>, then const modal = useModal(); await modal.confirm(
// { title, message, danger }) resolves true/false. modal.open(render) mounts
// arbitrary content and returns a close fn.
const ModalCtx = React.createContext(null);

export function ModalProvider({ children }) {
  const [stack, setStack] = React.useState([]);
  const close = React.useCallback((id, result) => {
    setStack((s) => s.filter((m) => m.id !== id));
    const m = stack.find((x) => x.id === id);
    if (m && m.resolve) m.resolve(result);
  }, [stack]);
  const api = React.useMemo(() => ({
    confirm: (opts = {}) => new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      setStack((s) => [...s, { id, type: "confirm", opts, resolve }]);
    }),
    open: (render, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      setStack((s) => [...s, { id, type: "custom", render, opts }]);
      return () => setStack((s) => s.filter((m) => m.id !== id));
    },
  }), []);
  return (
    <ModalCtx.Provider value={api}>
      {children}
      {stack.map((m) => {
        if (m.type === "confirm") {
          const o = m.opts;
          return (
            <Modal key={m.id} open title={o.title || "Are you sure?"} width={o.width || 440} onClose={() => close(m.id, false)}
              footer={<><Button onClick={() => close(m.id, false)}>{o.cancelLabel || "Cancel"}</Button>
                <Button variant={o.danger ? "danger" : "primary"} onClick={() => close(m.id, true)}>{o.confirmLabel || (o.danger ? "Delete" : "Confirm")}</Button></>}>
              {o.message}
            </Modal>
          );
        }
        return (
          <Modal key={m.id} open title={m.opts.title} width={m.opts.width} onClose={() => close(m.id)}>
            {typeof m.render === "function" ? m.render(() => close(m.id)) : m.render}
          </Modal>
        );
      })}
    </ModalCtx.Provider>
  );
}

export function useModal() {
  const ctx = React.useContext(ModalCtx);
  if (!ctx) throw new Error("useModal must be used within <ModalProvider>");
  return ctx;
}
