import { useEffect, useState } from "react";

/** Default pause before a typed value is treated as settled. */
const DEFAULT_DELAY_MS = 300;

/**
 * Returns `value` only once it has stopped changing for `delayMs`.
 *
 * Used to keep a text filter out of a React Query key until the user pauses, so
 * typing a name fires one request rather than one per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_DELAY_MS): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
