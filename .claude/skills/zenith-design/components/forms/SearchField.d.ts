import * as React from "react";

/**
 * Zenith search field — the toolbar search pattern. Leading magnifier, rounded
 * sunken pill, gold focus ring, and a clear (×) once there's a value. Controlled
 * (`value`+`onChange`) or uncontrolled; `onSubmit` fires on Enter.
 */
export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "width"> {
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Fires with the new string. */
  onChange?: (value: string) => void;
  /** Fires with the value on Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}

export function SearchField(props: SearchFieldProps): React.JSX.Element;
