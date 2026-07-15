import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  INTERACTION_TYPES,
  ROLE_TYPES,
  STATUSES,
  type Application,
  type Company,
  type Contact,
  type Interaction,
  type Status,
} from "./types";
import "./App.css";

type Tab = "applications" | "board" | "companies" | "contacts";

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

export default function App() {
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
        {tab === "applications" && (
          <ApplicationsTab
            applications={applications}
            companies={companies}
            contacts={contacts}
            onChanged={reload}
            onError={setError}
          />
        )}
        {tab === "board" && (
          <BoardTab
            applications={applications}
            onChanged={reload}
            onError={setError}
          />
        )}
        {tab === "companies" && (
          <CompaniesTab
            companies={companies}
            onChanged={reload}
            onError={setError}
          />
        )}
        {tab === "contacts" && (
          <ContactsTab
            contacts={contacts}
            companies={companies}
            onChanged={reload}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}

interface TabProps {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}

function BoardTab({
  applications,
  onChanged,
  onError,
}: TabProps & { applications: Application[] }) {
  const move = (a: Application, status: string) =>
    api
      .setStatus(a.id, status)
      .then(onChanged)
      .catch((e) => onError((e as Error).message));

  const open = applications.filter((a) => !isDead(a.status));

  return (
    <div className="board">
      {PIPELINE.map((stage) => {
        const cards = open.filter((a) => a.status === stage);
        return (
          <section key={stage} className={`bcol stage-${stage}`}>
            <header className="bcol-head">
              {stage}
              <span className="n">{cards.length}</span>
            </header>
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
          </section>
        );
      })}
    </div>
  );
}

function Timeline({
  applicationId,
  onError,
}: {
  applicationId: number;
  onError: (message: string | null) => void;
}) {
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [form, setForm] = useState({ type: "email", happened_at: today(), notes: "" });

  const load = useCallback(
    () =>
      api
        .interactions(applicationId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    api
      .addInteraction(applicationId, {
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
            <span className="tl-notes">{it.notes ?? ""}</span>
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

function ApplicationsTab({
  applications,
  companies,
  contacts,
  onChanged,
  onError,
}: TabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
}) {
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered =
    statusFilter === "all"
      ? applications
      : applications.filter((a) => a.status === statusFilter);
  // Due items pinned on top, most overdue first
  const visible = [
    ...filtered
      .filter(isDue)
      .sort((a, b) =>
        (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""),
      ),
    ...filtered.filter((a) => !isDue(a)),
  ];

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <StageHistogram applications={applications} />
      <div className="toolbar">
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
        <button className="primary" onClick={() => setEditing("new")}>
          + Add job
        </button>
      </div>

      {editing && (
        <ApplicationForm
          initial={editing === "new" ? null : editing}
          companies={companies}
          contacts={contacts}
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
                  onChange={(e) =>
                    run(() => api.setStatus(a.id, e.target.value))
                  }
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
                  onClick={() => {
                    if (confirm(`Delete "${a.title}"?`))
                      run(() => api.remove("applications", a.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            {expandedId === a.id && (
              <Timeline applicationId={a.id} onError={onError} />
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
}: {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  onSubmit: (data: Partial<Application>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Application>>(
    initial ?? { role_type: "other", status: "interested" },
  );
  const set = (patch: Partial<Application>) =>
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
          {companies.map((c) => (
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
        <input
          type="url"
          value={form.url ?? ""}
          onChange={(e) => set({ url: e.target.value || null })}
        />
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
}: TabProps & { companies: Company[] }) {
  const [editing, setEditing] = useState<Company | "new" | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <span />
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
        {companies.map((c) => (
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
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"?`))
                      run(() => api.remove("companies", c.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {companies.length === 0 && <li className="empty">No companies yet.</li>}
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
}: TabProps & { contacts: Contact[]; companies: Company[] }) {
  const [editing, setEditing] = useState<Contact | "new" | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <span />
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
        {contacts.map((c) => (
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
                <button onClick={() => setEditing(c)}>Edit</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"?`))
                      run(() => api.remove("contacts", c.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {contacts.length === 0 && <li className="empty">No contacts yet.</li>}
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
