// Extracted verbatim from detail.tsx (the application detail's edit form:
// ~20 fields across basics/posting-compensation/offer/follow-up groups plus
// a URL-fetch row) as part of the #285 App.tsx/detail.tsx split. Composes
// the shared app form layer (.form/.form-group/.error/.error-text, App.css)
// which stays in App.css — only the url-row is self-contained styling here
// (ApplicationForm.css, .zui-url-row*).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { formatDate, isDead } from "../format";
import { ErrorIcon } from "../icons";
import { useSubmitGuard } from "../hooks";
import type { Application, Company, Contact, RoleTypeDef } from "../types";
import { ActionBar } from "./ActionBar";
import { Button } from "./Button";
import "./ApplicationForm.css";

export interface ApplicationFormProps {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  applications?: Application[];
  onSubmit: (data: Partial<Application>) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}

export function ApplicationForm({
  initial,
  companies,
  contacts,
  roleTypes,
  applications,
  onSubmit,
  onCancel,
  onError,
}: ApplicationFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Application>>(
    initial ?? { role_type: "other", status: "interested" },
  );
  const [extraCompanies, setExtraCompanies] = useState<Company[]>([]);
  const [importing, setImporting] = useState(false);
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Application>) =>
    setForm((f) => ({ ...f, ...patch }));

  const allCompanies = [...companies, ...extraCompanies];

  // Same company + not already dismissed/rejected/withdrawn — a soft,
  // dismissable nudge rather than a hard block, since deliberately
  // re-applying (different role, referral this time, reopened req) is
  // a real workflow (#217).
  const possibleDuplicate =
    !initial && form.company_id
      ? (applications ?? []).find(
          (a) => a.company_id === form.company_id && !isDead(a.status),
        )
      : null;

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
        submit(form);
      }}
    >
      {possibleDuplicate && (
        <p className="error">
          <ErrorIcon />
          <span className="error-text">
            {t("detail.possibleDuplicate", { title: possibleDuplicate.title })}
          </span>
        </p>
      )}
      <div className="form-group">
        <h4>{t("forms.basics")}</h4>
        <label>
          {t("forms.title")} *
          <input
            required
            value={form.title ?? ""}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label>
          {t("forms.roleType")}
          <select
            value={form.role_type ?? "other"}
            onChange={(e) =>
              set({ role_type: e.target.value as Application["role_type"] })
            }
          >
            {roleTypes.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("forms.company")}
          <select
            value={form.company_id ?? ""}
            onChange={(e) =>
              set({
                company_id: e.target.value ? Number(e.target.value) : null,
              })
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
          {t("forms.contact")}
          <select
            value={form.contact_id ?? ""}
            onChange={(e) =>
              set({
                contact_id: e.target.value ? Number(e.target.value) : null,
              })
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
          {t("referral.referredBy")}
          <select
            value={form.referred_by_contact_id ?? ""}
            onChange={(e) =>
              set({
                referred_by_contact_id: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
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
      </div>

      <div className="form-group">
        <h4>{t("forms.postingCompensation")}</h4>
        <label>
          {t("forms.url")}
          <span className="zui-url-row">
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
              {importing ? t("common.fetching") : t("common.fetch")}
            </button>
          </span>
        </label>
        <label>
          {t("forms.source")}
          <input
            placeholder={t("forms.sourcePlaceholder")}
            value={form.source ?? ""}
            onChange={(e) => set({ source: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.salaryRange")}
          <input
            placeholder={t("forms.salaryRangePlaceholder")}
            value={form.salary_range ?? ""}
            onChange={(e) => set({ salary_range: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.currency")}
          <select
            value={form.salary_currency ?? ""}
            onChange={(e) => set({ salary_currency: e.target.value || null })}
          >
            <option value="">—</option>
            {["EUR", "USD", "GBP"].map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("forms.min")}
          <input
            type="number"
            min={0}
            value={form.salary_min ?? ""}
            onChange={(e) =>
              set({
                salary_min: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          {t("forms.max")}
          <input
            type="number"
            min={0}
            value={form.salary_max ?? ""}
            onChange={(e) =>
              set({
                salary_max: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          {t("forms.per")}
          <select
            value={form.salary_period ?? ""}
            onChange={(e) =>
              set({
                salary_period: (e.target.value || null) as
                  | "year"
                  | "month"
                  | null,
              })
            }
          >
            <option value="">—</option>
            <option value="year">{t("forms.year")}</option>
            <option value="month">{t("forms.month")}</option>
          </select>
        </label>
        <label>
          {t("forms.appliedOn")}
          <input
            type="date"
            value={form.applied_at ?? ""}
            onChange={(e) => set({ applied_at: e.target.value || null })}
          />
        </label>
      </div>

      {form.status === "offer" && (
        <div className="form-group">
          <h4>{t("offer.title")}</h4>
          <label>
            {t("offer.signingBonus")}
            <input
              type="number"
              min={0}
              value={form.signing_bonus ?? ""}
              onChange={(e) =>
                set({
                  signing_bonus: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label>
            {t("offer.bonusTarget")}
            <input
              type="number"
              min={0}
              max={100}
              value={form.bonus_target_pct ?? ""}
              onChange={(e) =>
                set({
                  bonus_target_pct: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            {t("offer.equityValue")}
            <input
              type="number"
              min={0}
              value={form.equity_value ?? ""}
              onChange={(e) =>
                set({
                  equity_value: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label className="full">
            {t("offer.benefitsNotes")}
            <textarea
              rows={2}
              value={form.benefits_notes ?? ""}
              onChange={(e) =>
                set({ benefits_notes: e.target.value || null })
              }
            />
          </label>
        </div>
      )}

      <div className="form-group">
        <h4>{t("forms.followUp")}</h4>
        <label>
          {t("forms.nextAction")}
          <input
            placeholder={t("forms.nextActionPlaceholder")}
            value={form.next_action ?? ""}
            onChange={(e) => set({ next_action: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.nextActionDue")}
          <input
            type="date"
            value={form.next_action_at ?? ""}
            onChange={(e) => set({ next_action_at: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.deadline")}
          <input
            type="date"
            value={form.deadline_at ?? ""}
            onChange={(e) => set({ deadline_at: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.fitScore")}
          <select
            value={form.fit_score ?? ""}
            onChange={(e) =>
              set({
                fit_score: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          {t("forms.notes")}
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
          />
        </label>
        <label className="full">
          {t("detail.jobDescription")}
          {form.job_description_captured_at && (
            <span className="muted small">
              {" "}
              — {t("detail.jobDescriptionCaptured", {
                date: formatDate(form.job_description_captured_at),
              })}
            </span>
          )}
          <textarea
            rows={6}
            placeholder={t("detail.jobDescriptionPlaceholder")}
            value={form.job_description ?? ""}
            onChange={(e) => set({ job_description: e.target.value || null })}
          />
        </label>
      </div>

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
