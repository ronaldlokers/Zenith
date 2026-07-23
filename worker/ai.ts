import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// The user's own Anthropic API key, encrypted at rest with AES-GCM. The master
// key is the AI_KEY_ENCRYPTION_KEY secret (base64 32 bytes / AES-256); WebCrypto
// is already used for HMAC in public-api.ts. The stored key is write-only —
// decrypted only here, in the Worker, at call time; never returned to the
// client.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function masterKey(env: Env): Promise<CryptoKey | null> {
  if (!env.AI_KEY_ENCRYPTION_KEY) return null;
  return crypto.subtle.importKey(
    "raw",
    b64ToBytes(env.AI_KEY_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  env: Env,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string } | null> {
  const key = await masterKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bytesToB64(new Uint8Array(enc)), iv: bytesToB64(iv) };
}

export async function decryptSecret(
  env: Env,
  ciphertext: string,
  iv: string,
): Promise<string | null> {
  const key = await masterKey(env);
  if (!key) return null;
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(iv) },
    key,
    b64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(dec);
}

// Loads + decrypts the calling user's stored Anthropic key for the AI features.
// Returns null if none is stored or the master key is unset.
export async function getUserAnthropicKey(
  env: Env,
  userId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT ciphertext, iv FROM ai_credentials WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ ciphertext: string; iv: string }>();
  if (!row) return null;
  return decryptSecret(env, row.ciphertext, row.iv);
}

// Cheap auth check: /v1/models returns 200 for a valid key, 401 otherwise, and
// bills no tokens. Fixed host, so the url-guard (SSRF for user-supplied URLs)
// doesn't apply.
async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Resume tailoring ---

interface RoleRow {
  id: number;
  company: string;
  title: string;
  description: string | null;
}

export interface TailorResult {
  summary: string;
  experiences: { id: number; description: string }[];
}

// The model sometimes echoes the role heading into the description
// ("Title (Company): <body>"), but title/company are separate CV fields. Drop a
// leading segment (up to the first colon) when it names the role.
function stripRolePrefix(description: string, role: RoleRow): string {
  const colon = description.indexOf(":");
  if (colon > 0 && colon < 120) {
    const head = description.slice(0, colon).toLowerCase();
    if (
      head.includes(role.title.toLowerCase()) ||
      (role.company && head.includes(role.company.toLowerCase()))
    ) {
      return description.slice(colon + 1).replace(/^\s+/, "");
    }
  }
  return description;
}

// Pull a JSON object out of the model's reply, tolerating stray prose or
// ```json fences.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no json");
  return JSON.parse(text.slice(start, end + 1));
}

async function callClaudeTailor(
  apiKey: string,
  jobDescription: string,
  currentSummary: string,
  roles: RoleRow[],
): Promise<TailorResult> {
  const prompt = `You are helping tailor a CV to a specific job. Rewrite the professional summary and each work-experience description to emphasise the experience and skills most relevant to the job description below. Rules: stay strictly truthful — only rephrase and re-prioritise what is already written; never invent employers, job titles, dates, technologies, metrics, or achievements. Keep each description concise. Return ONLY a JSON object, no prose and no markdown fences, in exactly this shape:
{"summary": "<tailored summary>", "experiences": [{"id": <id>, "description": "<tailored description>"}]}
Include one experiences entry per role below, keyed by its id. For each description return ONLY the rewritten body text — do NOT prepend the job title, company name, dates, or any "Title (Company):" heading; those are stored separately.

JOB DESCRIPTION:
${jobDescription}

CURRENT SUMMARY:
${currentSummary || "(none)"}

WORK EXPERIENCE (JSON):
${JSON.stringify(
  roles.map((r) => ({
    id: r.id,
    company: r.company,
    title: r.title,
    description: r.description ?? "",
  })),
)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "your Anthropic key was rejected"
        : "the AI request failed",
    );
  }
  const data = await res.json<{ content: { type: string; text?: string }[] }>();
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  const parsed = extractJson(text) as Partial<TailorResult>;
  const byId = new Map(roles.map((r) => [r.id, r]));
  const experiences = (Array.isArray(parsed.experiences)
    ? parsed.experiences
    : []
  )
    .filter(
      (e): e is { id: number; description: string } =>
        !!e &&
        typeof e.id === "number" &&
        byId.has(e.id) &&
        typeof e.description === "string",
    )
    .map((e) => ({
      id: e.id,
      description: stripRolePrefix(e.description, byId.get(e.id)!),
    }));
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    experiences,
  };
}

// --- Mock interview (stateless multi-turn: the client holds the transcript
// and sends it back each turn) ---

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface InterviewContext {
  title?: string;
  company?: string;
  jobDescription?: string;
}

function buildInterviewSystem(ctx: InterviewContext): string {
  const role = ctx.title
    ? `the role of ${ctx.title}${ctx.company ? ` at ${ctx.company}` : ""}`
    : "this role";
  return `You are a professional interviewer running a realistic practice interview for ${role}. Ask ONE question at a time, relevant to the role${ctx.jobDescription ? " and the job description below" : ""}. After the candidate answers, give brief, specific, constructive feedback (1-2 sentences — what was strong, what to improve), then ask the next question. Make questions realistic and progressively deeper (a mix of behavioural and role-specific). Never answer on the candidate's behalf, and keep each turn concise.${
    ctx.jobDescription
      ? `\n\nJOB DESCRIPTION:\n${ctx.jobDescription.slice(0, 4000)}`
      : ""
  }`;
}

async function callClaudeChat(
  apiKey: string,
  system: string,
  messages: ChatMsg[],
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "your Anthropic key was rejected"
        : "the AI request failed",
    );
  }
  const data = await res.json<{ content: { type: string; text?: string }[] }>();
  return data.content?.find((b) => b.type === "text")?.text ?? "";
}

export function registerAiRoutes(app: Hono<AppEnv>) {
  app.get("/api/ai/credentials", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT hint FROM ai_credentials WHERE user_id = ?",
    )
      .bind(c.get("userId"))
      .first<{ hint: string | null }>();
    return c.json({ configured: !!row, hint: row?.hint ?? null });
  });

  app.put("/api/ai/credentials", async (c) => {
    if (!c.env.AI_KEY_ENCRYPTION_KEY) {
      return c.json({ error: "AI keys are not enabled on this server" }, 503);
    }
    const { apiKey } = await c.req.json<{ apiKey?: string }>();
    if (!apiKey || typeof apiKey !== "string") {
      return c.json({ error: "apiKey is required" }, 400);
    }
    if (!(await validateAnthropicKey(apiKey))) {
      return c.json({ error: "that API key was rejected by Anthropic" }, 400);
    }
    const enc = await encryptSecret(c.env, apiKey);
    if (!enc) {
      return c.json({ error: "AI keys are not enabled on this server" }, 503);
    }
    const hint = apiKey.slice(-4);
    await c.env.DB.prepare(
      `INSERT INTO ai_credentials (user_id, ciphertext, iv, hint) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         ciphertext = excluded.ciphertext, iv = excluded.iv,
         hint = excluded.hint, created_at = datetime('now')`,
    )
      .bind(c.get("userId"), enc.ciphertext, enc.iv, hint)
      .run();
    return c.json({ configured: true, hint });
  });

  app.delete("/api/ai/credentials", async (c) => {
    await c.env.DB.prepare("DELETE FROM ai_credentials WHERE user_id = ?")
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  // Tailor the CV (summary + each role's description) to a pasted job
  // description, using the user's own Anthropic key. Returns suggestions; the
  // client applies the ones it wants via the existing profile/work-experience
  // endpoints.
  app.post("/api/ai/tailor-cv", async (c) => {
    const userId = c.get("userId");
    const apiKey = await getUserAnthropicKey(c.env, userId);
    if (!apiKey) {
      return c.json(
        { error: "add your Anthropic API key in Account settings first" },
        400,
      );
    }
    const { jobDescription } = await c.req.json<{ jobDescription?: string }>();
    if (!jobDescription || jobDescription.trim().length < 20) {
      return c.json({ error: "paste a job description first" }, 400);
    }
    const profile = await c.env.DB.prepare(
      "SELECT summary FROM profile WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ summary: string | null }>();
    const { results: roles } = await c.env.DB.prepare(
      "SELECT id, company, title, description FROM work_experience WHERE user_id = ? ORDER BY sort_order, id",
    )
      .bind(userId)
      .all<RoleRow>();
    try {
      const result = await callClaudeTailor(
        apiKey,
        jobDescription,
        profile?.summary ?? "",
        roles,
      );
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  // One turn of a practice interview: the client sends the transcript so far
  // plus the role context; returns the interviewer's next message.
  app.post("/api/ai/mock-interview", async (c) => {
    const apiKey = await getUserAnthropicKey(c.env, c.get("userId"));
    if (!apiKey) {
      return c.json(
        { error: "add your Anthropic API key in Account settings first" },
        400,
      );
    }
    const { context, messages } = await c.req.json<{
      context?: InterviewContext;
      messages?: ChatMsg[];
    }>();
    // Cap the history so a long session can't balloon the request.
    const msgs = (Array.isArray(messages) ? messages : [])
      .filter(
        (m): m is ChatMsg =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .slice(-40);
    if (msgs.length === 0) return c.json({ error: "no messages" }, 400);
    try {
      const reply = await callClaudeChat(
        apiKey,
        buildInterviewSystem(context ?? {}),
        msgs,
      );
      return c.json({ reply });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });
}
