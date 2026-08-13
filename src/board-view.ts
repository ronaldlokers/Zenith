// The board's view state — search, sort, the three filters, the pinned
// filter — lives in the URL rather than in component state.
//
// It was component state, and that made a filtered board a thing you could
// only describe out loud: reload and it was gone, open a card and come back
// and it was gone, and there was no way to send someone (or yourself, later)
// the board you were actually looking at. Saved Views existed because the
// state had nowhere else to live; with the state in the URL a saved view is
// just a URL, and every filtered board is shareable whether or not anyone
// thought to name it first.
//
// Two rules, both learned the hard way by every app that has done this:
//
// - **Defaults never appear.** A board with nothing set has a bare /board.
//   Writing `?sort=urgency&role=all` for the default view makes every URL
//   look configured and makes "is this the default?" a string comparison
//   instead of a presence check.
// - **Every write replaces.** Filters are not navigation. Pushing a history
//   entry per keystroke turns Back into an undo log the user has to walk out
//   of one character at a time; replace means Back still leaves the board.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** A setter with useState's shape, so call sites don't have to change. */
export type ParamSetter<T> = (next: T | ((prev: T) => T)) => void;

export type ParamCodec<T> = {
  /** URL text to value. Must accept anything — the URL is user-editable. */
  parse: (raw: string | null) => T;
  /** Value to URL text, or null to leave the parameter off. */
  print: (value: T) => string | null;
};

export function stringParam(
  fallback: string,
  allowed?: readonly string[],
): ParamCodec<string> {
  return {
    parse: (raw) => {
      if (raw === null) return fallback;
      // A hand-edited or stale URL is a normal input here, not an attack:
      // an unknown sort key would otherwise sort by nothing and a deleted
      // tag id would empty the board with no way to see why.
      if (allowed && !allowed.includes(raw)) return fallback;
      return raw;
    },
    print: (value) => (value === fallback ? null : value),
  };
}

export const boolParam: ParamCodec<boolean> = {
  parse: (raw) => raw === "1",
  print: (value) => (value ? "1" : null),
};

/**
 * One URL-backed value. Reads render-fresh from the current location and
 * writes through `setSearchParams`, so two of these updated in the same
 * handler compose instead of overwriting each other — the updater form is
 * given the params as they stand, not as they were when the component
 * rendered.
 */
export function useViewParam<T>(key: string, codec: ParamCodec<T>): [T, ParamSetter<T>] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = useMemo(() => codec.parse(raw), [raw, codec]);
  const set = useCallback<ParamSetter<T>>(
    (next) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const current = codec.parse(p.get(key));
          const resolved =
            typeof next === "function" ? (next as (p: T) => T)(current) : next;
          const printed = codec.print(resolved);
          if (printed === null) p.delete(key);
          else p.set(key, printed);
          return p;
        },
        { replace: true },
      );
    },
    [key, codec, setParams],
  );
  return [value, set];
}

/**
 * Several parameters in one replace. Applying a saved view or clearing the
 * filters changes four values at once; doing that as four `useViewParam`
 * setters relies on each updater seeing the previous one's result inside a
 * single React batch, which the router does not promise. One patch, one
 * history replace, no ordering to reason about. A `null` drops the key.
 */
export function useViewPatch(): (patch: Record<string, string | null>) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) p.delete(key);
            else p.set(key, value);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
}
