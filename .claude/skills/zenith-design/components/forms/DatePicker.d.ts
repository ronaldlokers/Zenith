import * as React from "react";

/**
 * Zenith date picker — interview/deadline scheduling. A field that opens a
 * month-grid calendar. Controlled: parent owns `value` (a "YYYY-MM-DD" string or
 * null) and `onChange`. Today is ringed, the selected day is gold. Local time,
 * no dependencies.
 */
export interface DatePickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "value"> {
  /** Selected date as "YYYY-MM-DD", or null. */
  value?: string | null;
  /** Fires with the picked "YYYY-MM-DD". */
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
}

export function DatePicker(props: DatePickerProps): React.JSX.Element;
