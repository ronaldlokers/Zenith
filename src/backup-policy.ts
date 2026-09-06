// How long a nightly backup survives in R2 before the next run prunes it.
//
// Read by two places that must agree: runScheduledBackup, which does the
// pruning, and the delete-account dialog, which tells the person asking to be
// erased how long a copy of their data can still exist. Those two disagreeing
// is a false promise made at the worst possible moment, so the number lives
// here rather than once in each.
//
// Its own module because the worker cannot import src/format.ts (localStorage,
// the PDF helper) and the UI must not import the worker.
export const BACKUP_RETENTION_DAYS = 14;
