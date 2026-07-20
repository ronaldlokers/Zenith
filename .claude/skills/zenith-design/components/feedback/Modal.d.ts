import * as React from "react";

/**
 * Zenith modal / dialog. Scrim + centered surface (shadow-2, radius-lg). Closes
 * on scrim click, Escape, or the × button. Provide actions via `footer`
 * (primary Button last, right-aligned). Controlled by `open`.
 */
export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visibility — renders nothing when false. */
  open?: boolean;
  /** Header title. */
  title?: React.ReactNode;
  /** Called on scrim click, Escape, or ×. */
  onClose?: () => void;
  /** Footer action row. */
  footer?: React.ReactNode;
  /** Dialog width in px. */
  width?: number;
  children?: React.ReactNode;
}

export function Modal(props: ModalProps): React.JSX.Element | null;
