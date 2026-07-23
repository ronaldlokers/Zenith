// People (contacts) tab, its add/edit form, and the contact detail modal.
// Split out of the former network.tsx (#451) alongside companies.tsx.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { Dialog } from "./ui";
import { rowActivate, useSubmitGuard } from "./hooks";
import { Timeline } from "./timeline";
import { OutreachComposer } from "./outreach-composer";
import { EmptyPeopleIcon } from "./icons";
import { ActionBar, Button, EmptyState, FieldLabel, Row, SegmentedControl, Toolbar } from "./components";
import {
  formatDate,
  isFollowUpDue,
  isFollowUpOverdue,
  OUTREACH_STATUSES,
  safeHref,
} from "./format";
import type { Company, Contact, CrudTabProps, OutreachStatus } from "./types";

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
    () => (localStorage.getItem("zenith_contacts_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("zenith_contacts_view", v);
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
      <Toolbar>
        <input
          type="search"
          className="search"
          aria-label={t("toolbar.searchPeople")}
          placeholder={t("toolbar.searchPeople")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addContact")}
        </Button>
        <SegmentedControl role="group" aria-label={t("contacts.view")}>
          <button
            className={view === "list" ? "active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setViewAndPersist("list")}
          >
            {t("companies.viewList")}
          </button>
          <button
            className={view === "grid" ? "active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => setViewAndPersist("grid")}
          >
            {t("companies.viewGrid")}
          </button>
        </SegmentedControl>
      </Toolbar>

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
            <EmptyState as="li">
              <EmptyPeopleIcon />
              {contacts.length === 0
                ? t("empty.noPeople")
                : t("empty.noPeopleMatch")}
            </EmptyState>
          )}
        </ul>
      ) : (
      <ul className="cards">
        {visible.map((c) => (
          <Row
            key={c.id}
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
          </Row>
        ))}
        {visible.length === 0 && (
          <EmptyState as="li">
            <EmptyPeopleIcon />
            {contacts.length === 0
              ? t("empty.noPeople")
              : t("empty.noPeopleMatch")}
          </EmptyState>
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
      <ActionBar variant="form">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </ActionBar>
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
          <Button variant="close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </Button>
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
                <FieldLabel>{t("outreach.status")}</FieldLabel>
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

            <ActionBar variant="detail">
              <Button variant="secondary" onClick={() => setEditing(true)}>{t("common.edit")}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete("contacts", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </Button>
            </ActionBar>

            <h3 className="detail-sub">{t("templates.outreachHeading")}</h3>
            <OutreachComposer
              contact={c}
              onError={onError}
              onChanged={onChanged}
              notify={notify}
            />

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline resource="contacts" targetId={c.id} onError={onError} />
          </>
        )}
    </Dialog>
  );
}

