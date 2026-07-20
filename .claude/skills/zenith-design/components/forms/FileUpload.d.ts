import * as React from "react";

/**
 * Zenith file dropzone — CV import & avatar upload. Dashed sunken well that
 * turns gold on drag-over; click opens the native picker. Presentational:
 * reports chosen files via `onFiles`. Pass `files` to render selected names.
 */
export interface FileUploadProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Called with chosen File[] (drop or picker). */
  onFiles?: (files: File[]) => void;
  /** Native accept string, e.g. ".pdf,.docx". */
  accept?: string;
  multiple?: boolean;
  /** Secondary constraint hint. */
  hint?: string;
  /** Prompt text. */
  label?: string;
  /** Selected files (or names) to list below. */
  files?: Array<File | string>;
}

export function FileUpload(props: FileUploadProps): React.JSX.Element;
