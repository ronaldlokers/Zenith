import * as React from "react";

/**
 * Zenith tag input / combobox — skills & company tagging. Gold chips for
 * selected values plus a filtered suggestion list. Controlled: parent owns
 * `value` (string[]) and `onChange`. Enter/comma commits, Backspace on empty
 * removes the last chip. Set `allowCustom={false}` to restrict to suggestions.
 */
export interface ComboboxProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Selected tags. */
  value: string[];
  /** Fires with the next tag array. */
  onChange?: (value: string[]) => void;
  /** Autocomplete pool. */
  suggestions?: string[];
  placeholder?: string;
  /** Allow values not in suggestions (default true). */
  allowCustom?: boolean;
  label?: string;
  id?: string;
}

export function Combobox(props: ComboboxProps): React.JSX.Element;
