import * as React from "react";

/**
 * Zenith range slider — single value with a gold fill/thumb on a native
 * <input type=range>. Controlled (`value`+`onChange`) or uncontrolled
 * (`defaultValue`). Optional label with a live, `format`-able value readout.
 */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> {
  label?: string;
  /** Controlled value. */
  value?: number;
  /** Uncontrolled initial value. */
  defaultValue?: number;
  /** Fires with the new number. */
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Format the readout, e.g. v => `${v}%`. */
  format?: (value: number) => React.ReactNode;
  id?: string;
}

export function Slider(props: SliderProps): React.JSX.Element;
