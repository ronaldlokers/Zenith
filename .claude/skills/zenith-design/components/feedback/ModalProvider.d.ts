import * as React from "react";

export interface ConfirmOptions {
  title?: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  width?: number;
}

export interface ModalApi {
  /** Resolves true (confirm) / false (cancel or dismiss). */
  confirm: (opts?: ConfirmOptions) => Promise<boolean>;
  /** Mount arbitrary content; returns a close fn. `render` may take a close callback. */
  open: (render: React.ReactNode | ((close: () => void) => React.ReactNode), opts?: { title?: React.ReactNode; width?: number }) => () => void;
}

/**
 * Provider + hook for imperative dialogs. Wrap the app once in `<ModalProvider>`,
 * then `const modal = useModal(); if (await modal.confirm({ danger: true })) …`.
 * Built on the Modal component; supports stacked dialogs.
 */
export interface ModalProviderProps {
  children?: React.ReactNode;
}

export function ModalProvider(props: ModalProviderProps): React.JSX.Element;
export function useModal(): ModalApi;
