// The precondition 0060 gave contacts and companies, applied to the three CV
// forms that have the same shape: they rewrite every field they own from a
// copy loaded when the page opened, so a save from a stale tab reverts what it
// never showed. 412 per RFC 9110 13.1, and the current validator comes back in
// the body so the client can say what it collided with.
//
// Additive: no header, no precondition, so every existing caller — the tailor
// panel writing one field, the LinkedIn import — behaves exactly as before.
//
// updated_at is datetime('now') at second resolution, so two saves inside one
// second are indistinguishable. That is the case this is least needed for; the
// conflict it prevents is a form left open for minutes or hours.
export function stale(
  ifMatch: string | undefined,
  current: string | null | undefined,
): boolean {
  return !!ifMatch && ifMatch !== current;
}

export const conflict = (
  current: string | null | undefined,
  message = "it changed somewhere else",
) => ({ error: message, current_updated_at: current }) as const;
