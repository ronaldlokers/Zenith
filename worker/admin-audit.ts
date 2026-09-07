// Audit trail for admin actions that carry security/privacy weight — who did
// what to whom. An admin resetting another user's second factor, or
// impersonating them via Better Auth's admin plugin, previously left no
// trace anywhere (security review).
//
// Same append-only shape as cron_runs (worker/cron-log.ts), and for the same
// reason: a small INSERT that never blocks the reader. It differs from
// cron_runs on purpose in one place — see recordAdminAction below — because
// unlike an operational log, a missing audit row is the defect this exists
// to prevent, not a risk to shrug off.
export interface AdminActionInput {
  actorId: string;
  targetId: string;
  action: string;
}

// Deliberately does NOT swallow its own errors the way recordCronRun does.
// Callers that can (the custom /api/admin/* routes) write this row before
// performing the action it describes, so a failed insert stops the action
// rather than letting it happen unrecorded — and once the insert resolves,
// it is committed independently of whatever the caller does next, so it
// survives a later step in the same request failing.
export async function recordAdminAction(
  env: Env,
  input: AdminActionInput,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO admin_actions (actor_id, target_id, action) VALUES (?, ?, ?)",
  )
    .bind(input.actorId, input.targetId, input.action)
    .run();
}
