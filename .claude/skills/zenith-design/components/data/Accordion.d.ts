import * as React from "react";

/** One accordion section. */
export interface AccordionItem {
  /** Stable id. */
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Zenith accordion — collapsible sections (Settings, CV). Hairline-divided rows
 * with a rotating chevron. Single-open by default; `multiple` allows several.
 * Uncontrolled via `defaultOpen` (an id or array of ids).
 */
export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AccordionItem[];
  /** Allow multiple panels open. */
  multiple?: boolean;
  /** Initially open id(s). */
  defaultOpen?: string | string[] | null;
}

export function Accordion(props: AccordionProps): React.JSX.Element;
