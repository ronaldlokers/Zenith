import * as React from "react";

/** A single Table column definition. */
export interface TableColumn<Row = any> {
  /** Field key; also the sort id. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** CSS width, e.g. "30%" or 120. */
  width?: number | string;
  align?: "left" | "center" | "right";
  /** Enables the sort caret (requires onSort). */
  sortable?: boolean;
  /** Custom cell renderer; defaults to row[key]. */
  render?: (row: Row) => React.ReactNode;
}

export interface TableSort {
  key: string;
  dir: "asc" | "desc";
}

/**
 * Zenith data table — hairline rows on surface with a sticky uppercase-mono
 * header and a gold sort caret on the active column. Presentational and
 * controlled: the parent owns `sort` + `onSort` and does the actual sorting.
 */
export interface TableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSort"> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Active sort state. */
  sort?: TableSort | null;
  /** Fires with the next {key,dir} when a sortable header is clicked. */
  onSort?: (sort: TableSort) => void;
  /** Stable key per row. */
  rowKey?: (row: Row, index: number) => React.Key;
  /** Row click handler (adds hover affordance). */
  onRowClick?: (row: Row) => void;
}

export function Table<Row = any>(props: TableProps<Row>): React.JSX.Element;
