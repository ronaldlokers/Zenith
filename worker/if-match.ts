// The optimistic-concurrency rule, in one place because six routes need it:
// the three PUTs in index.ts (companies, contacts, applications) and the three
// CV forms in cv.ts. All six rewrite every field they own from a copy loaded
// when the page opened, so a save from a stale tab reverts what it never
// showed. 412 per RFC 9110 13.1, and the current validator comes back in the
// body so the client can say what it collided with.
//
// It was written twice — once in cv.ts, once per route in index.ts — which is
// how the error bodies ended up differing. They still do, deliberately: the
// message is a parameter because each resource names itself, and only the
// status, the header semantics and the body shape have to agree.
//
// Additive: no header, no precondition, so a caller that sends none — the
// tailor panel writing one field, the LinkedIn import — is unaffected.
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
