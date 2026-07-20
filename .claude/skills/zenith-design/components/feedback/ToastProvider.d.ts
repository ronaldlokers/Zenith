import * as React from "react";

export interface ToastOptions {
  kind?: "success" | "info" | "warning" | "danger";
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Override the provider's auto-dismiss (ms; 0 = sticky). */
  duration?: number;
}

export interface ToastApi {
  show: (opts: ToastOptions) => string;
  success: (title: React.ReactNode, message?: React.ReactNode, opts?: ToastOptions) => string;
  info: (title: React.ReactNode, message?: React.ReactNode, opts?: ToastOptions) => string;
  warning: (title: React.ReactNode, message?: React.ReactNode, opts?: ToastOptions) => string;
  danger: (title: React.ReactNode, message?: React.ReactNode, opts?: ToastOptions) => string;
  /** Dismiss a toast by the id returned when it was shown. */
  dismiss: (id: string) => void;
}

/**
 * Provider + hook for imperative toasts. Wrap the app once in `<ToastProvider>`,
 * then `const toast = useToast(); toast.success("Saved")`. Toasts stack in a
 * corner and auto-dismiss on the provider's `duration`.
 */
export interface ToastProviderProps {
  children?: React.ReactNode;
  /** Default auto-dismiss in ms. */
  duration?: number;
  placement?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

export function ToastProvider(props: ToastProviderProps): React.JSX.Element;
export function useToast(): ToastApi;
