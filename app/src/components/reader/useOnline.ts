// The connection (v4.13).
//
// The phone comes back online without asking, and the app has to be
// ready for it: the reading switches back to ElevenLabs, the indexing
// queue starts again, the assistant says it is back.
import { useEffect, useRef } from "react";

/** Call `fn` when the phone comes back online. */
export function useOnline(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => ref.current();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
}
