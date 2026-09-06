// Lifted out of worker/index.ts, and not only for size: workerd treats every
// named export of the entry module as a service entrypoint, so
// `export const EXPORT_DOCUMENT_BUDGET_BYTES = ...` there made the Worker
// refuse to start —
//
//   Uncaught TypeError: Incorrect type for map entry
//   'EXPORT_DOCUMENT_BUDGET_BYTES': the provided value is not of type
//   'function or ExportedHandler'.
//
// tsc, the build, oxlint and the whole unit suite were all green on it. Only
// booting the real Worker showed it, which is what the e2e layer is for.
// The documents table stores an R2 key, a filename and a size — never the
// content. So the export named every CV and cover letter the user had without
// including one of them: someone exporting their data in order to leave got a
// list of files they no longer had any way to fetch.
//
// The bytes travel base64 in the same JSON rather than as signed download
// links. Links would mean a route reachable without a session, on a product
// whose whole posture is invite-only, and they expire — an export should still
// be readable in a year, off a disk, with no server involved.
//
// Base64 costs 4/3 the size and the Worker has 128 MB, so there is a budget.
// The important half is that exceeding it is stated: an export that silently
// drops a file is worse than the metadata-only one it replaced, because it
// looks complete.
export const EXPORT_DOCUMENT_BUDGET_BYTES = 25 * 1024 * 1024;

export interface OmittedDocument {
  id: number;
  filename: string;
  size: number;
  reason: string;
}

function toBase64(bytes: ArrayBuffer): string {
  // Chunked: String.fromCharCode(...) on a whole multi-megabyte file blows the
  // argument limit before it blows the memory.
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 8192) {
    binary += String.fromCharCode(...view.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function attachDocumentBytes(
  env: Env,
  documents: Record<string, unknown>[],
): Promise<OmittedDocument[]> {
  const omitted: OmittedDocument[] = [];
  let spent = 0;
  for (const doc of documents) {
    const size = Number(doc.size ?? 0);
    const filename = String(doc.filename ?? "");
    const id = Number(doc.id ?? 0);
    if (spent + size > EXPORT_DOCUMENT_BUDGET_BYTES) {
      doc.content_base64 = null;
      omitted.push({ id, filename, size, reason: "export size limit" });
      continue;
    }
    const object = await env.DOCS.get(String(doc.key));
    if (!object) {
      // The row outlived its file. Worth saying so rather than emitting a
      // null that reads like "too big".
      doc.content_base64 = null;
      omitted.push({ id, filename, size, reason: "file not found in storage" });
      continue;
    }
    doc.content_base64 = toBase64(await object.arrayBuffer());
    spent += size;
  }
  return omitted;
}
