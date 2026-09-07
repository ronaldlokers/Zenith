import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

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

// The routes over those rows, moved out of worker/index.ts (#93). This module
// already owned the R2 side of documents while the router carried all four
// handlers and the Content-Disposition helper — 21 lines here against a
// hundred and thirty there, which is the split tracking when code was written
// rather than what it is.

// Content-Disposition carried the stored filename with nothing but the double
// quotes stripped out, and a filename is whatever the uploader called the
// file. Two things went wrong with that.
//
// A header value is ISO-8859-1 by the spec, so UTF-8 bytes in a quoted-string
// are not something a browser can be asked to interpret: "Lebenslauf
// Müller.pdf" and "履歴書.pdf" both went out raw and came back mojibake.
// RFC 6266 has the answer — an ASCII filename for agents that only understand
// that, and filename* with the real name percent-encoded as UTF-8.
//
// Order matters and is the reason filename comes first: an agent that does
// not implement filename* is specified to ignore it where it appears after
// filename, and would otherwise take the encoded form as the literal name.
//
// The second thing is worse than cosmetic. A control character in a header
// value throws where the Response is constructed, so a file whose name held a
// newline uploaded fine and then answered 500 on every download, for good —
// the only way out of it was to delete the file.
function contentDisposition(filename: string): string {
  const ascii =
    filename
      // Everything outside printable ASCII, which is also what removes the
      // control characters that made the header unconstructable.
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "")
      .trim() || "download";
  // encodeURIComponent leaves a handful of characters that RFC 5987's
  // attr-char does not admit; percent-encode those too rather than emit a
  // value that is only nearly valid.
  const encoded = encodeURIComponent(filename).replace(
    /['()*!]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// --- Documents (R2) ---

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function registerDocumentRoutes(app: Hono<AppEnv>) {
  app.get("/api/applications/:id/documents", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, application_id, filename, label, size, content_type, created_at
     FROM documents WHERE application_id = ? AND user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .all();
  return c.json(results);
});

  app.post("/api/applications/:id/documents", async (c) => {
  const filename = c.req.query("filename");
  if (!filename) return c.json({ error: "filename query param is required" }, 400);
  const size = Number(c.req.header("Content-Length") ?? 0);
  if (!size) return c.json({ error: "empty body" }, 400);
  if (size > MAX_DOCUMENT_BYTES) {
    return c.json({ error: "file too large (max 10 MB)" }, 413);
  }
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const application = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(appId, userId)
    .first();
  if (!application) return c.json({ error: "not found" }, 404);
  const contentType =
    c.req.header("Content-Type") ?? "application/octet-stream";
  // A random key rather than a timestamped one. The key was
  // `app-<id>/<Date.now()>-<filename>`, so two uploads of the same filename to
  // the same application in the same millisecond built the same key — and
  // since the object is written before the row is claimed, the second put
  // overwrote the first file while the second insert failed on the unique
  // key. Measured: one upload answered 201, the other 409, one row survived,
  // and the object under it held the *other* file's bytes. The row that said
  // it succeeded served the wrong document from then on.
  //
  // Uniqueness by construction ends that, rather than a narrower window.
  const key = `app-${appId}/${crypto.randomUUID()}-${filename}`;
  // Content-Length is a client-supplied claim, not a fact — a request can
  // understate it and stream more bytes than it declared. The header check
  // above stays as a cheap early reject for an honest over-cap declaration,
  // but nothing that gets enforced or stored may trust it further. R2
  // already counts the real bytes as it streams the body to storage and
  // hands the true count back on the returned object, so reading `.size`
  // off it gets the measured length for free — no separate counting stream
  // (and no buffering) needed.
  const stored = await c.env.DOCS.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });
  const measured = stored.size;
  if (measured > MAX_DOCUMENT_BYTES) {
    // put() only resolves once the stream is fully consumed, so R2 has
    // already accepted the object by the time the real count is known.
    // Leaving it behind is exactly the orphan this file exists to prevent
    // (see deleteDocumentObjects above).
    //
    // So this bounds what is *stored*, not what is written: a hostile client
    // still causes one oversized write before the delete. Piping the body
    // through a counting stream to abort earlier is not available — R2 needs
    // a stream carrying the runtime's known-length tag and rejects a
    // JS-authored transform with "Provided readable stream must have a known
    // length". Worth revisiting if that changes.
    await c.env.DOCS.delete(key);
    return c.json({ error: "file too large (max 10 MB)" }, 413);
  }
  let result;
  try {
    result = await c.env.DB.prepare(
      `INSERT INTO documents (application_id, user_id, key, filename, label, size, content_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, application_id, filename, label, size, content_type, created_at`,
    )
      .bind(appId, userId, key, filename, c.req.query("label") ?? null, measured, contentType)
      .first();
  } catch (e) {
    // The row is the only thing that will ever name this key, so a failed
    // insert has to take the object with it — otherwise the upload leaves a
    // file nobody can reach, count or delete. The application being deleted
    // between the check above and here is the way this happens.
    await c.env.DOCS.delete(key);
    throw e;
  }
  return c.json(result, 201);
});

  app.get("/api/documents/:id/download", async (c) => {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ key: string; filename: string; content_type: string | null }>();
  if (!doc) return c.json({ error: "not found" }, 404);
  const object = await c.env.DOCS.get(doc.key);
  if (!object) return c.json({ error: "file missing from storage" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": doc.content_type ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(doc.filename),
    },
  });
});

  app.delete("/api/documents/:id", async (c) => {
  const doc = await c.env.DB.prepare("SELECT key FROM documents WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ key: string }>();
  if (doc) {
    await c.env.DOCS.delete(doc.key);
    await c.env.DB.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
      .bind(c.req.param("id"), c.get("userId"))
      .run();
  }
  return c.body(null, 204);
});
}
