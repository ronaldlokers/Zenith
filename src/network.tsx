// Network feature extracted from App.tsx (#285 split) — the Companies and
// People tabs, their forms, the relationship map, and the company/contact
// detail modals. SettingsPage-free; imports shared modules only.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { Dialog } from "./ui";
import { rowActivate, useSubmitGuard } from "./hooks";
import { Timeline } from "./timeline";
import { EmptyCompaniesIcon, EmptyPeopleIcon } from "./icons";
import {
  ageDays,
  formatDate,
  isDead,
  isFollowUpDue,
  isFollowUpOverdue,
  OUTREACH_STATUSES,
  safeHref,
} from "./format";
import type {
  Application,
  Company,
  Contact,
  CrudTabProps,
  OutreachStatus,
} from "./types";

export function CompaniesTab({
  companies,
  applications,
  contacts,
  onChanged,
  onError,
  notify,
  onDelete,
  initialQuery,
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  companies: Company[];
  applications: Application[];
  contacts: Contact[];
  initialQuery?: string;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [detailId, setDetailIdState] = useState<number | null>(
    initialDetailId ?? null,
  );
  useEffect(() => {
    setDetailIdState(initialDetailId ?? null);
  }, [initialDetailId]);
  const setDetailId = (id: number | null) => {
    setDetailIdState(id);
    onDetailIdChange?.(id);
  };
  const detailCompany = companies.find((c) => c.id === detailId) ?? null;
  // Logo-first card grid (#132) — scans faster once tracking a dozen+
  // companies than the list rows do. Persisted so the choice sticks
  // across visits/reloads.
  const [view, setView] = useState<"list" | "grid">(
    () => (localStorage.getItem("jobseekr_companies_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("jobseekr_companies_view", v);
  };

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
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          aria-label={t("toolbar.searchCompanies")}
          placeholder={t("toolbar.searchCompanies")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addCompany")}
        </button>
        <div className="board-group-toggle" role="group" aria-label={t("companies.view")}>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setViewAndPersist("list")}
          >
            {t("companies.viewList")}
          </button>
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setViewAndPersist("grid")}
          >
            {t("companies.viewGrid")}
          </button>
        </div>
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

      {view === "grid" ? (
        <ul className="company-grid">
          {visible.map((c) => (
            <li
              key={c.id}
              className="company-tile"
              {...rowActivate(() => setDetailId(c.id))}
            >
              {c.logo_url ? (
                <img className="company-logo" src={c.logo_url} alt="" />
              ) : (
                <div className="company-logo company-logo-placeholder" aria-hidden="true">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="company-tile-name">
                {c.name}
                {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
              </span>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="empty">
              <EmptyCompaniesIcon />
              {companies.length === 0
                ? t("empty.noCompanies")
                : t("empty.noCompaniesMatch")}
            </li>
          )}
        </ul>
      ) : (
      <ul className="cards">
        {visible.map((c) => {
          const referrals = applications.filter(
            (a) =>
              a.company_id === c.id &&
              a.referred_by_contact_id &&
              !isDead(a.status),
          ).length;
          return (
          <li
            key={c.id}
            className="card row2"
            {...rowActivate(() => setDetailId(c.id))}
          >
            <div className="l1">
              <strong>
                {c.name}
                {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
                {referrals > 0 ? (
                  <span className="badge">
                    {" "}
                    {t("referral.badgeCount", { count: referrals })}
                  </span>
                ) : null}
              </strong>
              <span className="co">{c.location ?? ""}</span>
            </div>
            <div className="l2">
              <span className="co">{c.website ?? ""}</span>
              <span className="due">
                {c.researched_at
                  ? t("company.researchedAgo", { age: ageDays(c.researched_at) })
                  : t("company.notResearched")}
              </span>
            </div>
          </li>
          );
        })}
        {visible.length === 0 && (
          <li className="empty">
            <EmptyCompaniesIcon />
            {companies.length === 0
              ? t("empty.noCompanies")
              : t("empty.noCompaniesMatch")}
          </li>
        )}
      </ul>
      )}
      {detailCompany && (
        <CompanyDetailModal
          company={detailCompany}
          contacts={contacts.filter((ct) => ct.company_id === detailCompany.id)}
          applications={applications.filter((a) => a.company_id === detailCompany.id)}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
        />
      )}
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
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Company>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Company>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("forms.name")} *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        {t("forms.website")}
        <input
          type="url"
          value={form.website ?? ""}
          onChange={(e) => set({ website: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.location")}
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
        {t("forms.recruitmentAgency")}
      </label>
      <label className="full">
        {t("forms.notes")}
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// Contact relationship map (#133) — a lightweight org-chart-style view
// under a company: referral chains (referrer → the contact they connected
// you with) built from data already on Application (referred_by_name,
// contact_name), plus any other contacts at the company not part of a
// chain. No new schema — there's no general "reports to" field, just
// what the referral link already captures.
function ContactRelationshipMap({
  contacts,
  applications,
}: {
  contacts: Contact[];
  applications: Application[];
}) {
  const { t } = useTranslation();
  if (contacts.length === 0) return null;

  const referralLinks = [
    ...new Map(
      applications
        .filter((a) => a.referred_by_name && a.contact_name)
        .map((a) => [
          `${a.referred_by_name}->${a.contact_name}`,
          { from: a.referred_by_name!, to: a.contact_name! },
        ]),
    ).values(),
  ];
  const linkedNames = new Set(
    referralLinks.flatMap((l) => [l.from, l.to]),
  );
  const unlinked = contacts.filter((c) => !linkedNames.has(c.name));

  return (
    <div className="contact-map">
      <h3 className="detail-sub">{t("company.contactMap")}</h3>
      {referralLinks.map((l, i) => (
        <div className="contact-map-link" key={i}>
          <span className="contact-map-node">{l.from}</span>
          <span className="contact-map-arrow">→</span>
          <span className="contact-map-node">{l.to}</span>
        </div>
      ))}
      <ul className="contact-map-list">
        {unlinked.map((c) => (
          <li key={c.id}>
            <span className="contact-map-node">{c.name}</span>
            {c.role && <span className="muted small"> · {c.role}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompanyDetailModal({
  company,
  contacts,
  applications,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
}: {
  company: Company;
  contacts: Contact[];
  applications: Application[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [researching, setResearching] = useState(false);
  const c = company;

  const research = () => {
    setResearching(true);
    api
      .researchCompany(c.id)
      .then(() => {
        notify(t("toast.researched", { name: c.name }));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setResearching(false));
  };

  return (
    <Dialog label={c.name} onClose={onClose} className="detail-modal">
        <div className="detail-head">
          <div>
            <h2>
              {c.name}
              {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
            </h2>
            <span className="muted small">{c.location ?? ""}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        {editing ? (
          <CompanyForm
            initial={c}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("companies", c.id, data)
                .then(() => {
                  setEditing(false);
                  notify(t("common.saved"));
                  return onChanged();
                })
                .catch((e) => onError((e as Error).message))
            }
          />
        ) : (
          <>
            <div className="detail-fields">
              {safeHref(c.website) && (
                <a href={safeHref(c.website)} target="_blank" rel="noreferrer" className="small">
                  {c.website}
                </a>
              )}
              {c.description && (
                <div>
                  <span className="field-label">{t("detail.description")}</span>
                  <p className="notes">{c.description}</p>
                </div>
              )}
              {c.notes && (
                <div>
                  <span className="field-label">{t("detail.notes")}</span>
                  <p className="notes">{c.notes}</p>
                </div>
              )}
              {c.researched_at && (
                <span className="age">
                  researched {ageDays(c.researched_at)} ago
                </span>
              )}
            </div>

            <ContactRelationshipMap contacts={contacts} applications={applications} />

            <div className="detail-actions">
              <button
                disabled={!c.website || researching}
                onClick={research}
              >
                {researching ? t("common.researching") : t("common.research")}
              </button>
              <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
              <button
                className="danger"
                onClick={() => {
                  onDelete("companies", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </>
        )}
    </Dialog>
  );
}

export function ContactsTab({
  contacts,
  companies,
  onChanged,
  onError,
  notify,
  onDelete,
  initialQuery,
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  contacts: Contact[];
  companies: Company[];
  initialQuery?: string;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [view, setView] = useState<"list" | "grid">(
    () => (localStorage.getItem("jobseekr_contacts_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("jobseekr_contacts_view", v);
  };
  const [query, setQuery] = useState(initialQuery ?? "");
  const [detailId, setDetailIdState] = useState<number | null>(
    initialDetailId ?? null,
  );
  useEffect(() => {
    setDetailIdState(initialDetailId ?? null);
  }, [initialDetailId]);
  const setDetailId = (id: number | null) => {
    setDetailIdState(id);
    onDetailIdChange?.(id);
  };
  const detailContact = contacts.find((c) => c.id === detailId) ?? null;

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
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          aria-label={t("toolbar.searchPeople")}
          placeholder={t("toolbar.searchPeople")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addContact")}
        </button>
        <div className="board-group-toggle" role="group" aria-label={t("contacts.view")}>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setViewAndPersist("list")}
          >
            {t("companies.viewList")}
          </button>
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setViewAndPersist("grid")}
          >
            {t("companies.viewGrid")}
          </button>
        </div>
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

      {view === "grid" ? (
        <ul className="company-grid">
          {visible.map((c) => (
            <li
              key={c.id}
              className="company-tile"
              {...rowActivate(() => setDetailId(c.id))}
            >
              <div className="company-logo company-logo-placeholder" aria-hidden="true">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="company-tile-name">{c.name}</span>
              {(c.role || c.company_name) && (
                <span className="muted small">
                  {[c.role, c.company_name].filter(Boolean).join(" · ")}
                </span>
              )}
              {c.outreach_status !== "not_contacted" && (
                <span className={`outreach-pill ${c.outreach_status}`}>
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              )}
            </li>
          ))}
          {visible.length === 0 && (
            <li className="empty">
              <EmptyPeopleIcon />
              {contacts.length === 0
                ? t("empty.noPeople")
                : t("empty.noPeopleMatch")}
            </li>
          )}
        </ul>
      ) : (
      <ul className="cards">
        {visible.map((c) => (
          <li
            key={c.id}
            className="card row2"
            {...rowActivate(() => setDetailId(c.id))}
          >
            <div className="l1">
              <strong>{c.name}</strong>
              <span className="co">
                {[c.role, c.company_name].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="l2">
              <span className="co">{c.email ?? c.phone ?? ""}</span>
              {c.outreach_status !== "not_contacted" && (
                <span className={`outreach-pill ${c.outreach_status}`}>
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              )}
              {c.follow_up_at && (isFollowUpDue(c) || isFollowUpOverdue(c)) && (
                <span
                  className={`due${isFollowUpOverdue(c) ? " late" : " today"}`}
                >
                  {t("outreach.followUpDue")}: {formatDate(c.follow_up_at)}
                </span>
              )}
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            <EmptyPeopleIcon />
            {contacts.length === 0
              ? t("empty.noPeople")
              : t("empty.noPeopleMatch")}
          </li>
        )}
      </ul>
      )}
      {detailContact && (
        <ContactDetailModal
          contact={detailContact}
          companies={companies}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
        />
      )}
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
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Contact>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("forms.name")} *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        {t("forms.role")}
        <input
          placeholder={t("forms.rolePlaceholder")}
          value={form.role ?? ""}
          onChange={(e) => set({ role: e.target.value || null })}
        />
      </label>
      <label>
        {t("outreach.status")}
        <select
          value={form.outreach_status ?? "not_contacted"}
          onChange={(e) =>
            set({ outreach_status: e.target.value as OutreachStatus })
          }
        >
          {OUTREACH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`outreach.statuses.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("outreach.lastContacted")}
        <input
          type="date"
          value={form.last_contacted_at ?? ""}
          onChange={(e) => set({ last_contacted_at: e.target.value || null })}
        />
      </label>
      <label>
        {t("outreach.followUpDue")}
        <input
          type="date"
          value={form.follow_up_at ?? ""}
          onChange={(e) => set({ follow_up_at: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.company")}
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
        {t("forms.email")}
        <input
          type="email"
          value={form.email ?? ""}
          onChange={(e) => set({ email: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.phone")}
        <input
          type="tel"
          value={form.phone ?? ""}
          onChange={(e) => set({ phone: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.linkedin")}
        <input
          type="url"
          value={form.linkedin ?? ""}
          onChange={(e) => set({ linkedin: e.target.value || null })}
        />
      </label>
      <label className="full">
        {t("forms.notes")}
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function ContactDetailModal({
  contact,
  companies,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
}: {
  contact: Contact;
  companies: Company[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const c = contact;

  return (
    <Dialog label={c.name} onClose={onClose} className="detail-modal">
        <div className="detail-head">
          <div>
            <h2>{c.name}</h2>
            <span className="muted small">
              {[c.role, c.company_name].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        {editing ? (
          <ContactForm
            initial={c}
            companies={companies}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("contacts", c.id, data)
                .then(() => {
                  setEditing(false);
                  notify(t("common.saved"));
                  return onChanged();
                })
                .catch((e) => onError((e as Error).message))
            }
          />
        ) : (
          <>
            <div className="detail-fields">
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
              {safeHref(c.linkedin) && (
                <a href={safeHref(c.linkedin)} target="_blank" rel="noreferrer" className="small">
                  {t("contact.linkedinLink")}
                </a>
              )}
              <div>
                <span className="field-label">{t("outreach.status")}</span>
                <span className="muted small">
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              </div>
              {c.last_contacted_at && (
                <span className="muted small">
                  {t("outreach.lastContacted")}: {formatDate(c.last_contacted_at)}
                </span>
              )}
              {c.follow_up_at && (
                <span
                  className={`small${isFollowUpOverdue(c) ? " warn-text" : isFollowUpDue(c) ? " warn-text" : ""}`}
                >
                  {t("outreach.followUpDue")}: {formatDate(c.follow_up_at)}
                </span>
              )}
              {c.notes && <p className="notes">{c.notes}</p>}
            </div>

            <div className="detail-actions">
              <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
              <button
                className="danger"
                onClick={() => {
                  onDelete("contacts", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </button>
            </div>

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline resource="contacts" targetId={c.id} onError={onError} />
          </>
        )}
    </Dialog>
  );
}

