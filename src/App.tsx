import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  INTERACTION_TYPES,
  type Stats,
  ROLE_TYPES,
  STATUSES,
  type Application,
  type Company,
  type Contact,
  type Document,
  type FeedItem,
  type Interaction,
  type Status,
} from "./types";
import "./App.css";

type Tab = "applications" | "board" | "feed" | "stats" | "companies" | "contacts";

const PIPELINE: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

const STAGE_ABBR: Record<string, string> = {
  interested: "int",
  applied: "app",
  screening: "scr",
  interview: "ivw",
  offer: "off",
};

function stageIndex(status: Status): number {
  return PIPELINE.indexOf(status);
}

function isDead(status: Status): boolean {
  return status === "rejected" || status === "withdrawn" || status === "ghosted";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at <= today();
}

function isOverdue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at < today();
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function ageDays(updatedAt: string): string {
  const then = new Date(updatedAt.replace(" ", "T") + "Z").getTime();
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  return `${days}d`;
}

function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={(size * 140) / 56}
      height={size}
      viewBox="0 0 140 56"
      fill="none"
      aria-hidden="true"
    >
      <line x1="14" y1="28" x2="98" y2="28" stroke="currentColor" strokeWidth="4" opacity="0.3" />
      <circle cx="14" cy="28" r="5.5" fill="currentColor" />
      <circle cx="38" cy="28" r="5.5" fill="currentColor" />
      <circle cx="62" cy="28" r="5.5" fill="currentColor" opacity="0.45" />
      <g stroke="var(--accent)" strokeWidth="3.6">
        <circle cx="106" cy="28" r="12" />
        <line x1="106" y1="10" x2="106" y2="16" />
        <line x1="106" y1="40" x2="106" y2="46" />
        <line x1="88" y1="28" x2="94" y2="28" />
        <line x1="118" y1="28" x2="124" y2="28" />
      </g>
      <circle cx="106" cy="28" r="4" fill="var(--accent)" />
    </svg>
  );
}

function StageRail({ status }: { status: Status }) {
  const idx = isDead(status) ? stageIndex("applied") : stageIndex(status);
  return (
    <div className={`rail${isDead(status) ? " dead" : ""}`}>
      {PIPELINE.map((s, i) => (
        <i key={s} className={i <= idx ? `on stage-${status}` : ""} />
      ))}
    </div>
  );
}

function StageHistogram({ applications }: { applications: Application[] }) {
  const open = applications.filter((a) => !isDead(a.status));
  const max = Math.max(1, ...PIPELINE.map(
    (s) => open.filter((a) => a.status === s).length,
  ));
  return (
    <div className="histo">
      {PIPELINE.map((s) => {
        const count = open.filter((a) => a.status === s).length;
        return (
          <div key={s} className={`hrow stage-${s}`}>
            <span className="lbl">{STAGE_ABBR[s]}</span>
            <span className="htrack">
              <span
                className="hfill"
                style={{ width: `${(count / max) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      const [apps, comps, conts] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const notify = useCallback((message: string, undo?: () => void) => {
    const id = Date.now();
    setToast({ id, message, undo });
    window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      undo ? 6000 : 3000,
    );
  }, []);

  // Delete with an undo window: hide immediately, commit after the
  // toast expires unless undone (cascaded data survives an undo).
  const deleteWithUndo = useCallback(
    (resource: string, id: number, name: string) => {
      const key = `${resource}:${id}`;
      setHidden((h) => new Set(h).add(key));
      const timer = window.setTimeout(() => {
        api
          .remove(resource, id)
          .then(reload)
          .catch((e) => setError((e as Error).message))
          .finally(() =>
            setHidden((h) => {
              const next = new Set(h);
              next.delete(key);
              return next;
            }),
          );
      }, 6000);
      notify(`Deleted "${name}"`, () => {
        window.clearTimeout(timer);
        setHidden((h) => {
          const next = new Set(h);
          next.delete(key);
          return next;
        });
      });
    },
    [notify, reload],
  );

  // Optimistic status change: update locally, revert on API failure
  const setStatus = useCallback(
    (id: number, status: Status) => {
      const prev = applications;
      setApplications((apps) =>
        apps.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      api
        .setStatus(id, status)
        .then(reload)
        .catch((e) => {
          setApplications(prev);
          setError((e as Error).message);
        });
    },
    [applications, reload],
  );

  const visibleApps = applications.filter(
    (a) => !hidden.has(`applications:${a.id}`),
  );
  const visibleCompanies = companies.filter(
    (c) => !hidden.has(`companies:${c.id}`),
  );
  const visibleContacts = contacts.filter(
    (c) => !hidden.has(`contacts:${c.id}`),
  );

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo />
          <h1>JobSeekr</h1>
        </div>
        <span className="open-count">
          {applications.filter((a) => !isDead(a.status)).length} open
          {applications.filter(isDue).length > 0 &&
            ` · ${applications.filter(isDue).length} due`}
        </span>
      </header>
      <nav className="tabs">
        <button
          className={tab === "applications" ? "active" : ""}
          onClick={() => setTab("applications")}
        >
          Jobs
        </button>
        <button
          className={tab === "board" ? "active" : ""}
          onClick={() => setTab("board")}
        >
          Board
        </button>
        <button
          className={tab === "feed" ? "active" : ""}
          onClick={() => setTab("feed")}
        >
          Feed
        </button>
        <button
          className={tab === "stats" ? "active" : ""}
          onClick={() => setTab("stats")}
        >
          Stats
        </button>
        <button
          className={tab === "companies" ? "active" : ""}
          onClick={() => setTab("companies")}
        >
          Companies
        </button>
        <button
          className={tab === "contacts" ? "active" : ""}
          onClick={() => setTab("contacts")}
        >
          People
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      <main className="content">
        {loading ? (
          <p className="muted small loading">Loading…</p>
        ) : (
          <>
            {tab === "applications" && (
              <ApplicationsTab
                applications={visibleApps}
                companies={visibleCompanies}
                contacts={visibleContacts}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                onStatus={setStatus}
              />
            )}
            {tab === "board" && (
              <BoardTab
                applications={visibleApps}
                onChanged={reload}
                onError={setError}
                onStatus={setStatus}
              />
            )}
            {tab === "feed" && (
              <FeedTab onError={setError} notify={notify} />
            )}
            {tab === "stats" && <StatsTab onError={setError} />}
            {tab === "companies" && (
              <CompaniesTab
                companies={visibleCompanies}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
              />
            )}
            {tab === "contacts" && (
              <ContactsTab
                contacts={visibleContacts}
                companies={visibleCompanies}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
              />
            )}
          </>
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface TabProps {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}

interface CrudTabProps extends TabProps {
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}

function BoardTab({
  applications,
  onStatus,
}: TabProps & {
  applications: Application[];
  onStatus: (id: number, status: Status) => void;
}) {
  const move = (a: Application, status: string) =>
    onStatus(a.id, status as Status);

  const open = applications.filter((a) => !isDead(a.status));

  // Collapsed by default, except stages with something due — keeps a
  // long mobile scroll from burying the stage that actually needs
  // attention under every earlier one. A manual toggle wins once used.
  const [manualOpen, setManualOpen] = useState<Partial<Record<Status, boolean>>>(
    {},
  );

  return (
    <div className="board">
      {PIPELINE.map((stage) => {
        const cards = open.filter((a) => a.status === stage);
        const hasDue = cards.some(isDue);
        const isOpen = manualOpen[stage] ?? hasDue;
        return (
          <details
            key={stage}
            className={`bcol stage-${stage}`}
            open={isOpen}
            onToggle={(e) =>
              setManualOpen((m) => ({
                ...m,
                [stage]: (e.target as HTMLDetailsElement).open,
              }))
            }
          >
            <summary className="bcol-head">
              {stage}
              <span className="n">{cards.length}</span>
            </summary>
            {cards.map((a) => (
              <article key={a.id} className={`bcard stage-${a.status}`}>
                <strong>{a.title}</strong>
                <span className="co">
                  {a.company_name ?? "—"}
                  {a.contact_name ? ` · ${a.contact_name}` : ""}
                </span>
                <span className="bmeta">
                  {isDue(a) && a.next_action ? (
                    <span className={isOverdue(a) ? "late" : "today"}>
                      → {a.next_action}
                    </span>
                  ) : (
                    `upd ${ageDays(a.updated_at)}`
                  )}
                </span>
                <select
                  className={`status stage-${a.status}`}
                  value={a.status}
                  onChange={(e) => move(a, e.target.value)}
                  aria-label={`Move ${a.title} to stage`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </article>
            ))}
            {cards.length === 0 && (
              <div className="bempty">
                {stage === "offer" ? "keep pushing" : "empty"}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

function Timeline({
  resource,
  targetId,
  onError,
}: {
  resource: "applications" | "contacts";
  targetId: number;
  onError: (message: string | null) => void;
}) {
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [form, setForm] = useState({ type: "email", happened_at: today(), notes: "" });

  const load = useCallback(
    () =>
      api
        .interactions(resource, targetId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [resource, targetId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    api
      .addInteraction(resource, targetId, {
        type: form.type,
        happened_at: form.happened_at,
        notes: form.notes || null,
      })
      .then(() => {
        setForm({ type: "email", happened_at: today(), notes: "" });
        return load();
      })
      .catch((err) => onError((err as Error).message));
  };

  return (
    <div className="timeline">
      <form className="tl-add" onSubmit={add}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          aria-label="Interaction type"
        >
          {INTERACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.happened_at}
          onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
          aria-label="Interaction date"
        />
        <input
          placeholder="What happened?"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <button type="submit" className="primary">
          Log
        </button>
      </form>
      <ul className="tl-items">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <span className="tl-type">{it.type}</span>
            <span className="tl-date">{formatDate(it.happened_at)}</span>
            <span className="tl-notes">
              {it.notes ?? ""}
              {it.via_contact ? <span className="badge">via contact</span> : null}
            </span>
            <button
              className="tl-del danger"
              aria-label="Delete interaction"
              onClick={() =>
                api
                  .remove("interactions", it.id)
                  .then(load)
                  .catch((e) => onError((e as Error).message))
              }
            >
              ×
            </button>
          </li>
        ))}
        {items?.length === 0 && (
          <li className="tl-empty">No touchpoints logged yet.</li>
        )}
      </ul>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function Documents({
  applicationId,
  onError,
}: {
  applicationId: number;
  onError: (message: string | null) => void;
}) {
  const [items, setItems] = useState<Document[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .documents(applicationId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    api
      .uploadDocument(applicationId, file, label || null)
      .then(() => {
        setLabel("");
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="docs">
      <div className="docs-add">
        <input
          placeholder="Label (CV v3, cover letter, …)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className={`upload-btn${busy ? " busy" : ""}`}>
          {busy ? "Uploading…" : "Attach file"}
          <input
            type="file"
            hidden
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ul className="docs-items">
        {(items ?? []).map((d) => (
          <li key={d.id}>
            <a href={`/api/documents/${d.id}/download`} download>
              {d.filename}
            </a>
            {d.label && <span className="doc-label">{d.label}</span>}
            <span className="doc-size">{formatSize(d.size)}</span>
            <button
              className="tl-del danger"
              aria-label="Delete document"
              onClick={() => {
                if (confirm(`Delete "${d.filename}"?`))
                  api
                    .remove("documents", d.id)
                    .then(load)
                    .catch((e) => onError((e as Error).message));
              }}
            >
              ×
            </button>
          </li>
        ))}
        {items?.length === 0 && <li className="tl-empty">No files attached.</li>}
      </ul>
    </div>
  );
}

function parseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

function StatsTab({ onError }: { onError: (m: string | null) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!stats) return <p className="muted small">Loading stats…</p>;
  const { applications: apps, history } = stats;

  // Applications per week, last 8 weeks. Uses applied_at (when the lead
  // actually moved) rather than created_at (when it was logged in the
  // app, which can be days or weeks after the fact).
  const WEEK = 7 * 86400000;
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (7 - i) * WEEK;
    const count = apps.filter((a) => {
      const t = parseSqlDate(a.applied_at ?? a.created_at);
      return t >= start && t < start + WEEK;
    }).length;
    const d = new Date(start);
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    return { label, count };
  });
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));

  // Furthest pipeline stage each application ever reached
  const reachedByApp = new Map<number, number>();
  for (const row of history) {
    const idx = PIPELINE.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reachedByApp.get(row.application_id) ?? -1;
    if (idx > prev) reachedByApp.set(row.application_id, idx);
  }
  const funnel = PIPELINE.map((stage, i) => ({
    stage,
    count: [...reachedByApp.values()].filter((r) => r >= i).length,
  }));
  const funnelMax = Math.max(1, funnel[0].count);

  // Average days spent per pipeline stage
  const stageDays = new Map<string, { total: number; n: number }>();
  const byApp = new Map<number, typeof history>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  for (const rows of byApp.values()) {
    for (let i = 0; i < rows.length; i++) {
      const stage = rows[i].to_status;
      if (!PIPELINE.includes(stage)) continue;
      const start = parseSqlDate(rows[i].changed_at);
      const end =
        i + 1 < rows.length ? parseSqlDate(rows[i + 1].changed_at) : now;
      const cur = stageDays.get(stage) ?? { total: 0, n: 0 };
      cur.total += (end - start) / 86400000;
      cur.n += 1;
      stageDays.set(stage, cur);
    }
  }

  // Ghost rate per source
  const bySource = new Map<string, { total: number; ghosted: number }>();
  for (const a of apps) {
    const src = a.source?.trim() || "unknown";
    const cur = bySource.get(src) ?? { total: 0, ghosted: 0 };
    cur.total += 1;
    if (a.status === "ghosted") cur.ghosted += 1;
    bySource.set(src, cur);
  }

  return (
    <section className="stats">
      <h2 className="stat-h">Applications per week</h2>
      <div className="histo">
        {weeks.map((w) => (
          <div key={w.label} className="hrow" title={`Week of ${w.label}: ${w.count}`}>
            <span className="lbl">{w.label}</span>
            <span className="htrack">
              <span
                className="hfill accent-fill"
                style={{ width: `${(w.count / weekMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{w.count}</span>
          </div>
        ))}
      </div>

      <h2 className="stat-h">Pipeline funnel — applications that reached each stage</h2>
      <div className="histo">
        {funnel.map((f) => (
          <div
            key={f.stage}
            className={`hrow stage-${f.stage}`}
            title={`${f.count} reached ${f.stage}`}
          >
            <span className="lbl">{STAGE_ABBR[f.stage]}</span>
            <span className="htrack">
              <span
                className="hfill"
                style={{ width: `${(f.count / funnelMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{f.count}</span>
          </div>
        ))}
      </div>

      <h2 className="stat-h">Average time in stage</h2>
      <ul className="stat-list">
        {PIPELINE.filter((s) => stageDays.has(s)).map((s) => {
          const d = stageDays.get(s)!;
          return (
            <li key={s} className={`stage-${s}`}>
              <span className="stat-dot" />
              <span>{s}</span>
              <span className="stat-val">{(d.total / d.n).toFixed(1)}d</span>
            </li>
          );
        })}
        {stageDays.size === 0 && <li className="tl-empty">No history yet.</li>}
      </ul>

      <h2 className="stat-h">Ghost rate by source</h2>
      <ul className="stat-list">
        {[...bySource.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([src, v]) => (
            <li key={src}>
              <span>{src}</span>
              <span className="muted small">{v.total} apps</span>
              <span className="stat-val">
                {Math.round((v.ghosted / v.total) * 100)}% ghosted
              </span>
            </li>
          ))}
        {bySource.size === 0 && <li className="tl-empty">No applications yet.</li>}
      </ul>

      <h2 className="stat-h">Export your data</h2>
      <p className="export-links">
        <a href="/api/export" download>
          Everything (JSON)
        </a>
        {["applications", "companies", "contacts", "interactions"].map(
          (t) => (
            <a key={t} href={`/api/export/${t}.csv`} download>
              {t} (CSV)
            </a>
          ),
        )}
      </p>
    </section>
  );
}

function FeedTab({
  onError,
  notify,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () => api.feed().then(setItems).catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    api
      .refreshFeed()
      .then((r) => {
        notify(`Found ${r.inserted} new of ${r.seen} checked`);
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setRefreshing(false));
  };

  const dismiss = (item: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    api
      .dismissFeedItem(item.id)
      .catch((e) => onError((e as Error).message));
  };

  const add = (item: FeedItem) => {
    api
      .addFeedItem(item.id)
      .then(() => {
        setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
        notify(`Added "${item.title}" to Jobs`);
      })
      .catch((e) => onError((e as Error).message));
  };

  return (
    <section>
      <div className="toolbar">
        <p className="muted small" style={{ margin: 0 }}>
          Pulled from Adzuna, HN Who's Hiring, and Arbeitnow every 6 hours.
        </p>
        <button className="primary" disabled={refreshing} onClick={refresh}>
          {refreshing ? "Checking…" : "Check now"}
        </button>
      </div>

      <ul className="cards">
        {(items ?? []).map((item) => (
          <li key={item.id} className="card">
            <div className="card-body">
              <div className="card-main">
                <strong>{item.title}</strong>
                <span className="muted small">
                  {[item.company, item.location].filter(Boolean).join(" · ")}
                </span>
                <span className="muted small">
                  {item.role_type}
                  {item.salary_text ? ` · ${item.salary_text}` : ""}
                  {" · via "}
                  {item.source}
                </span>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer" className="small">
                    View posting ↗
                  </a>
                )}
              </div>
              <div className="card-actions">
                <button className="primary" onClick={() => add(item)}>
                  Add to Jobs
                </button>
                <button onClick={() => dismiss(item)}>Dismiss</button>
              </div>
            </div>
          </li>
        ))}
        {items?.length === 0 && (
          <li className="empty">
            Nothing new. Feed checks automatically every 6 hours, or hit
            "Check now".
          </li>
        )}
      </ul>
    </section>
  );
}

function ApplicationsTab({
  applications,
  companies,
  contacts,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  onStatus: (id: number, status: Status) => void;
}) {
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "applied" | "company">(
    "updated",
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = applications.filter(
    (a) =>
      (statusFilter === "all" || a.status === statusFilter) &&
      (roleFilter === "all" || a.role_type === roleFilter) &&
      (companyFilter === "all" || String(a.company_id) === companyFilter) &&
      (!q ||
        [a.title, a.company_name, a.contact_name, a.notes, a.source]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "applied")
      return (b.applied_at ?? "").localeCompare(a.applied_at ?? "");
    if (sort === "company")
      return (a.company_name ?? "￿").localeCompare(
        b.company_name ?? "￿",
      );
    return b.updated_at.localeCompare(a.updated_at);
  });
  // Due items pinned on top, most overdue first
  const visible = [
    ...sorted
      .filter(isDue)
      .sort((a, b) =>
        (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""),
      ),
    ...sorted.filter((a) => !isDue(a)),
  ];

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify("Saved");
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <StageHistogram applications={applications} />
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search title, company, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          + Add job
        </button>
      </div>
      <div className="filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          {ROLE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        >
          <option value="all">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="updated">Last updated</option>
          <option value="applied">Applied date</option>
          <option value="company">Company name</option>
        </select>
      </div>

      {editing && (
        <ApplicationForm
          initial={editing === "new" ? null : editing}
          companies={companies}
          contacts={contacts}
          onError={onError}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("applications", data)
                : api.update("applications", editing.id, data),
            )
          }
        />
      )}

      <ul className="cards">
        {visible.map((a) => (
          <li
            key={a.id}
            className={`card stage-${a.status}${isOverdue(a) ? " overdue" : ""}`}
          >
            <div className="card-body">
              <div className="card-main">
                <strong>{a.title}</strong>
                {(a.next_action || a.next_action_at) && (
                  <span
                    className={`due-line${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
                  >
                    → {a.next_action ?? "follow up"}
                    {a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}
                  </span>
                )}
                <span className="muted small">
                  {a.company_name ?? "—"}
                  {a.contact_name ? ` · ${a.contact_name}` : ""}
                </span>
                <span className="muted small">
                  {a.role_type}
                  {a.source ? ` · via ${a.source}` : ""}
                  {a.salary_range ? ` · ${a.salary_range}` : ""}
                </span>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="small"
                  >
                    Job posting ↗
                  </a>
                )}
                {a.notes && <p className="notes">{a.notes}</p>}
              </div>
              <div className="card-actions">
                <select
                  className={`status stage-${a.status}`}
                  value={a.status}
                  onChange={(e) => onStatus(a.id, e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="age">upd {ageDays(a.updated_at)}</span>
                <button
                  onClick={() =>
                    setExpandedId(expandedId === a.id ? null : a.id)
                  }
                >
                  Log
                </button>
                <button onClick={() => setEditing(a)}>Edit</button>
                <button
                  className="danger"
                  onClick={() => onDelete("applications", a.id, a.title)}
                >
                  Delete
                </button>
              </div>
            </div>
            {expandedId === a.id && (
              <>
                <Timeline resource="applications" targetId={a.id} onError={onError} />
                <Documents applicationId={a.id} onError={onError} />
              </>
            )}
            <StageRail status={a.status} />
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
              <line x1="20" y1="76" x2="70" y2="26" strokeWidth="5" opacity="0.28" strokeLinecap="round" />
              <circle cx="20" cy="76" r="7" fill="currentColor" stroke="none" />
              <circle cx="36.7" cy="59.3" r="7" fill="currentColor" stroke="none" />
              <circle cx="53.3" cy="42.7" r="7" fill="currentColor" stroke="none" opacity="0.35" />
              <circle cx="72" cy="24" r="11" strokeWidth="5.5" className="accent-stroke" />
            </svg>
            No jobs yet. Add your first lead and start the climb.
          </li>
        )}
      </ul>
    </section>
  );
}

function ApplicationForm({
  initial,
  companies,
  contacts,
  onSubmit,
  onCancel,
  onError,
}: {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  onSubmit: (data: Partial<Application>) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const [form, setForm] = useState<Partial<Application>>(
    initial ?? { role_type: "other", status: "interested" },
  );
  const [extraCompanies, setExtraCompanies] = useState<Company[]>([]);
  const [importing, setImporting] = useState(false);
  const set = (patch: Partial<Application>) =>
    setForm((f) => ({ ...f, ...patch }));

  const allCompanies = [...companies, ...extraCompanies];

  // Fetch the job page and pre-fill; creates the company if unknown
  const importFromUrl = async () => {
    if (!form.url) return;
    setImporting(true);
    try {
      const r = await api.importUrl(form.url);
      const patch: Partial<Application> = {};
      if (r.title && !form.title) patch.title = r.title;
      if (r.salary && !form.salary_range) patch.salary_range = r.salary;
      if (r.source && !form.source) patch.source = r.source;
      if (r.company) {
        const existing = allCompanies.find(
          (c) => c.name.toLowerCase() === r.company!.toLowerCase(),
        );
        if (existing) {
          patch.company_id = existing.id;
        } else {
          const created = await api.create<Company>("companies", {
            name: r.company,
            location: r.location,
          });
          setExtraCompanies((x) => [...x, created]);
          patch.company_id = created.id;
        }
      }
      set(patch);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Title *
        <input
          required
          value={form.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        Role type
        <select
          value={form.role_type ?? "other"}
          onChange={(e) =>
            set({ role_type: e.target.value as Application["role_type"] })
          }
        >
          {ROLE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Company
        <select
          value={form.company_id ?? ""}
          onChange={(e) =>
            set({ company_id: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">—</option>
          {allCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contact
        <select
          value={form.contact_id ?? ""}
          onChange={(e) =>
            set({ contact_id: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">—</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        URL
        <span className="url-row">
          <input
            type="url"
            value={form.url ?? ""}
            onChange={(e) => set({ url: e.target.value || null })}
          />
          <button
            type="button"
            disabled={!form.url || importing}
            onClick={importFromUrl}
          >
            {importing ? "Fetching…" : "Fetch"}
          </button>
        </span>
      </label>
      <label>
        Source
        <input
          placeholder="LinkedIn, referral, …"
          value={form.source ?? ""}
          onChange={(e) => set({ source: e.target.value || null })}
        />
      </label>
      <label>
        Salary range
        <input
          value={form.salary_range ?? ""}
          onChange={(e) => set({ salary_range: e.target.value || null })}
        />
      </label>
      <label>
        Applied on
        <input
          type="date"
          value={form.applied_at ?? ""}
          onChange={(e) => set({ applied_at: e.target.value || null })}
        />
      </label>
      <label>
        Next action
        <input
          placeholder="Nudge recruiter, prep case study, …"
          value={form.next_action ?? ""}
          onChange={(e) => set({ next_action: e.target.value || null })}
        />
      </label>
      <label>
        Next action due
        <input
          type="date"
          value={form.next_action_at ?? ""}
          onChange={(e) => set({ next_action_at: e.target.value || null })}
        />
      </label>
      <label className="full">
        Notes
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CompaniesTab({
  companies,
  onChanged,
  onError,
  notify,
  onDelete,
}: CrudTabProps & { companies: Company[] }) {
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = companies.filter(
    (c) =>
      !q ||
      [c.name, c.location, c.notes, c.website]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
  );

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify("Saved");
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search companies…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          + Add company
        </button>
      </div>

      {editing && (
        <CompanyForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("companies", data)
                : api.update("companies", editing.id, data),
            )
          }
        />
      )}

      <ul className="cards">
        {visible.map((c) => (
          <li key={c.id} className="card">
            <div className="card-body">
              <div className="card-main">
                <strong>
                  {c.name}
                  {c.is_agency ? <span className="badge"> agency</span> : null}
                </strong>
                <span className="muted small">{c.location ?? ""}</span>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="small"
                  >
                    {c.website}
                  </a>
                )}
                {c.notes && <p className="notes">{c.notes}</p>}
              </div>
              <div className="card-actions">
                <button onClick={() => setEditing(c)}>Edit</button>
                <button
                  className="danger"
                  onClick={() => onDelete("companies", c.id, c.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            {companies.length === 0
              ? "No companies yet. Add the ones you're targeting — applications and contacts link to them."
              : "No companies match your search."}
          </li>
        )}
      </ul>
    </section>
  );
}

function CompanyForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Company | null;
  onSubmit: (data: Partial<Company>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Company>>(initial ?? {});
  const set = (patch: Partial<Company>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Name *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        Website
        <input
          type="url"
          value={form.website ?? ""}
          onChange={(e) => set({ website: e.target.value || null })}
        />
      </label>
      <label>
        Location
        <input
          value={form.location ?? ""}
          onChange={(e) => set({ location: e.target.value || null })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!form.is_agency}
          onChange={(e) => set({ is_agency: e.target.checked ? 1 : 0 })}
        />
        Recruitment agency
      </label>
      <label className="full">
        Notes
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ContactsTab({
  contacts,
  companies,
  onChanged,
  onError,
  notify,
  onDelete,
}: CrudTabProps & { contacts: Contact[]; companies: Company[] }) {
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const q = query.trim().toLowerCase();
  const visible = contacts.filter(
    (c) =>
      !q ||
      [c.name, c.role, c.company_name, c.email, c.notes]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
  );

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify("Saved");
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          + Add contact
        </button>
      </div>

      {editing && (
        <ContactForm
          initial={editing === "new" ? null : editing}
          companies={companies}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("contacts", data)
                : api.update("contacts", editing.id, data),
            )
          }
        />
      )}

      <ul className="cards">
        {visible.map((c) => (
          <li key={c.id} className="card">
            <div className="card-body">
              <div className="card-main">
                <strong>{c.name}</strong>
                <span className="muted small">
                  {[c.role, c.company_name].filter(Boolean).join(" · ")}
                </span>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="small">
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="small">
                    {c.phone}
                  </a>
                )}
                {c.linkedin && (
                  <a
                    href={c.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="small"
                  >
                    LinkedIn ↗
                  </a>
                )}
                {c.notes && <p className="notes">{c.notes}</p>}
              </div>
              <div className="card-actions">
                <button
                  onClick={() =>
                    setExpandedId(expandedId === c.id ? null : c.id)
                  }
                >
                  Log
                </button>
                <button onClick={() => setEditing(c)}>Edit</button>
                <button
                  className="danger"
                  onClick={() => onDelete("contacts", c.id, c.name)}
                >
                  Delete
                </button>
              </div>
            </div>
            {expandedId === c.id && (
              <Timeline resource="contacts" targetId={c.id} onError={onError} />
            )}
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            {contacts.length === 0
              ? "No people yet. Add recruiters and hiring managers so you can log every touchpoint."
              : "No people match your search."}
          </li>
        )}
      </ul>
    </section>
  );
}

function ContactForm({
  initial,
  companies,
  onSubmit,
  onCancel,
}: {
  initial: Contact | null;
  companies: Company[];
  onSubmit: (data: Partial<Contact>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Contact>>(initial ?? {});
  const set = (patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Name *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        Role
        <input
          placeholder="Recruiter, hiring manager, …"
          value={form.role ?? ""}
          onChange={(e) => set({ role: e.target.value || null })}
        />
      </label>
      <label>
        Company
        <select
          value={form.company_id ?? ""}
          onChange={(e) =>
            set({ company_id: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">—</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Email
        <input
          type="email"
          value={form.email ?? ""}
          onChange={(e) => set({ email: e.target.value || null })}
        />
      </label>
      <label>
        Phone
        <input
          type="tel"
          value={form.phone ?? ""}
          onChange={(e) => set({ phone: e.target.value || null })}
        />
      </label>
      <label>
        LinkedIn
        <input
          type="url"
          value={form.linkedin ?? ""}
          onChange={(e) => set({ linkedin: e.target.value || null })}
        />
      </label>
      <label className="full">
        Notes
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
