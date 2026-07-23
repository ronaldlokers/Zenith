// Companies tab, its add/edit form, the contact-relationship map, and the
// company detail modal. Split out of the former network.tsx (#451) alongside
// contacts.tsx; imports shared modules only.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { Dialog } from "./ui";
import { rowActivate, useSubmitGuard } from "./hooks";
import { EmptyCompaniesIcon } from "./icons";
import { ActionBar, Badge, Button, EmptyState, FieldLabel, Row, SegmentedControl, Toolbar } from "./components";
import { ageDays, isDead, safeHref } from "./format";
import type { Application, Company, Contact, CrudTabProps } from "./types";

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
    () => (localStorage.getItem("zenith_companies_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("zenith_companies_view", v);
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
      <Toolbar>
        <input
          type="search"
          className="search"
          aria-label={t("toolbar.searchCompanies")}
          placeholder={t("toolbar.searchCompanies")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addCompany")}
        </Button>
        <SegmentedControl role="group" aria-label={t("companies.view")}>
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
                {c.is_agency ? <Badge>{t("company.agencyBadge")}</Badge> : null}
              </span>
            </li>
          ))}
          {visible.length === 0 && (
            <EmptyState as="li">
              <EmptyCompaniesIcon />
              {companies.length === 0
                ? t("empty.noCompanies")
                : t("empty.noCompaniesMatch")}
            </EmptyState>
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
          <Row
            key={c.id}
            {...rowActivate(() => setDetailId(c.id))}
          >
            <div className="l1">
              <strong>
                {c.name}
                {c.is_agency ? <Badge>{t("company.agencyBadge")}</Badge> : null}
                {referrals > 0 ? (
                  <Badge>
                    {" "}
                    {t("referral.badgeCount", { count: referrals })}
                  </Badge>
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
          </Row>
          );
        })}
        {visible.length === 0 && (
          <EmptyState as="li">
            <EmptyCompaniesIcon />
            {companies.length === 0
              ? t("empty.noCompanies")
              : t("empty.noCompaniesMatch")}
          </EmptyState>
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
              {c.is_agency ? <Badge>{t("company.agencyBadge")}</Badge> : null}
            </h2>
            <span className="muted small">{c.location ?? ""}</span>
          </div>
          <Button variant="close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </Button>
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
                  <FieldLabel>{t("detail.description")}</FieldLabel>
                  <p className="notes">{c.description}</p>
                </div>
              )}
              {c.notes && (
                <div>
                  <FieldLabel>{t("detail.notes")}</FieldLabel>
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

            <ActionBar variant="detail">
              <Button
                variant="secondary"
                disabled={!c.website || researching}
                onClick={research}
              >
                {researching ? t("common.researching") : t("common.research")}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>{t("common.edit")}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete("companies", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </Button>
            </ActionBar>
          </>
        )}
    </Dialog>
  );
}

