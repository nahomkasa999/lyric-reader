// Is the phone online? (v4.13)
//
// `navigator.onLine` is a hint, never a proof: it says the phone has a
// connection, not that the server is reachable. It is used to decide
// whether to try at all — a fetch failure is still handled on its own.
export function isOnline(): boolean {
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

/** Did this error come from the network rather than from the server? */
export function isNetworkError(e: Error): boolean {
  return e.name === "TypeError" || /fetch|network/i.test(e.message);
}
