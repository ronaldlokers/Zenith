// R2 side of the documents table. The rows are pointers; deleting one without
// the other leaves either a link to nothing or a file nothing can name, and
// the second is the one that lasts — an object whose key is only recorded in
// the row that just went is unreachable and uncountable from then on.
//
// Two paths reach this. Deleting an application drops its documents through
// an ON DELETE CASCADE, which happens inside SQLite where no code runs, so
// the keys have to be read before the row goes. Deleting an account wipes the
// table outright, with the same problem.

/** Removes stored files by key, in the batches R2 accepts. */
export async function deleteDocumentObjects(
  bucket: R2Bucket,
  keys: string[],
): Promise<void> {
  // R2 takes up to 1000 keys per call, and silently doing fewer than asked is
  // exactly the failure this file exists to prevent.
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
}
