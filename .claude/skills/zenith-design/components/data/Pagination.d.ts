import * as React from "react";

/**
 * Zenith pagination — prev/next chevrons plus a windowed set of page numbers
 * with ellipses. Controlled: parent owns `page` (1-based) and `onChange`. The
 * active page is gold; others are neutral ghost buttons.
 */
export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  /** Current page, 1-based. */
  page: number;
  /** Total page count. */
  total: number;
  /** Fires with the requested page. */
  onChange?: (page: number) => void;
}

export function Pagination(props: PaginationProps): React.JSX.Element;
