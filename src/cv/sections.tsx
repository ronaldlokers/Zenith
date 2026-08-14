// CV editor sections: profile, work experience, education, languages
// (with their inline forms). Split out of cv.tsx (#452).
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useDeleteWithUndo } from "./delete-with-undo";
import { useSubmitGuard } from "../hooks";
import { EmptyCvIcon, RemoveIcon } from "../icons";
import {
  ActionBar,
  Button,
  Chip,
  CvItem,
  EmptyState,
  RowMenu,
} from "../components";
import type { Education, Language, Profile, WorkExperience } from "../types";
import { formatMonthYear } from "../format";
import "./cv.css";

export function ProfileSection({
  profile,
  onChanged,
  onError,
  notify,
}: {
  profile: Profile;
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(profile);
  const set = (patch: Partial<Profile>) => setForm((f) => ({ ...f, ...patch }));

  // Re-seed when the saved profile changes underneath the form. useState's
  // initial value is read once, so after the tailor panel applied an AI
  // summary and refreshed the data, this form still held the pre-AI text —
  // and the user's next Save wrote it back, silently reverting the edit they
  // had just accepted, on the one field that feature exists to improve.
  //
  // Guarded on identity: `profile` is a fresh object on every refetch, so an
  // unconditional effect would also wipe whatever the user was typing every
  // time anything else on the page reloaded. Only a real change to the saved
  // values re-seeds.
  // Compared by value, not field by field: a hand-written list of fields
  // silently stops covering the one that gets added next.
  const savedRef = useRef(JSON.stringify(profile));
  useEffect(() => {
    const next = JSON.stringify(profile);
    if (savedRef.current === next) return;
    savedRef.current = next;
    setForm(profile);
  }, [profile]);

  const [submitting, submit] = useSubmitGuard(async () => {
    await api
      .updateProfile(form)
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  });
  const save = (e: FormEvent) => {
    e.preventDefault();
    submit(undefined);
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="form-group">
        <h4>{t("cv.profile")}</h4>
        <label>
          {t("cv.name")}
          <input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          {t("cv.email")}
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set({ email: e.target.value })}
          />
        </label>
        <label>
          {t("cv.phone")}
          <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          {t("cv.location")}
          <input
            value={form.location ?? ""}
            onChange={(e) => set({ location: e.target.value })}
          />
        </label>
        <label>
          {t("cv.linkedin")}
          <input
            type="url"
            value={form.linkedin ?? ""}
            onChange={(e) => set({ linkedin: e.target.value })}
          />
        </label>
        <label>
          {t("cv.github")}
          <input
            type="url"
            value={form.github ?? ""}
            onChange={(e) => set({ github: e.target.value })}
          />
        </label>
        <label>
          {t("cv.portfolio")}
          <input
            type="url"
            value={form.portfolio ?? ""}
            onChange={(e) => set({ portfolio: e.target.value })}
          />
        </label>
        <label className="full">
          {t("cv.summary")}
          <textarea
            rows={3}
            value={form.summary ?? ""}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </label>
      </div>
      <ActionBar variant="form">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
      </ActionBar>
    </form>
  );
}

function WorkExperienceForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: WorkExperience | null;
  onSubmit: (data: Partial<WorkExperience>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<WorkExperience>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<WorkExperience>) =>
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
        {t("cv.company")} *
        <input
          required
          value={form.company ?? ""}
          onChange={(e) => set({ company: e.target.value })}
        />
      </label>
      <label>
        {t("cv.jobTitle")} *
        <input
          required
          value={form.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startMonth")}
        <input
          type="number"
          min={1}
          max={12}
          value={form.start_month ?? ""}
          onChange={(e) =>
            set({ start_month: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!form.is_current}
          onChange={(e) => set({ is_current: e.target.checked ? 1 : 0 })}
        />
        {t("cv.current")}
      </label>
      {!form.is_current && (
        <>
          <label>
            {t("cv.endMonth")}
            <input
              type="number"
              min={1}
              max={12}
              value={form.end_month ?? ""}
              onChange={(e) =>
                set({ end_month: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label>
            {t("cv.endYear")}
            <input
              type="number"
              value={form.end_year ?? ""}
              onChange={(e) =>
                set({ end_year: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
        </>
      )}
      <label className="full">
        {t("cv.description")}
        <textarea
          rows={3}
          value={form.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
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

export function WorkExperienceSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: WorkExperience[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<WorkExperience | "new" | null>(null);
  const { hidden, remove } = useDeleteWithUndo(
    "work-experience",
    onChanged,
    onError,
    notify,
  );
  const visible = items.filter((w) => !hidden.has(w.id));
  const [newSkill, setNewSkill] = useState<Record<number, string>>({});

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const addSkill = (workExperienceId: number) => {
    const name = (newSkill[workExperienceId] ?? "").trim();
    if (!name) return;
    api
      .addWorkExperienceSkill(workExperienceId, name)
      .then(() => {
        setNewSkill((m) => ({ ...m, [workExperienceId]: "" }));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const move = (index: number, dir: -1 | 1) => {
    // Indexes into the rendered list, not the raw one: a row hidden by a
    // pending delete shifts every index after it, and reading the other list
    // here swaps the wrong pair.
    const other = visible[index + dir];
    const item = visible[index];
    if (!other) return;
    Promise.all([
      api.patch("work-experience", item.id, { sort_order: other.sort_order }),
      api.patch("work-experience", other.id, { sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.workExperience")}</h3>
      <ul className="cv-list">
        {visible.map((w, i) => (
          <CvItem key={w.id}>
            <div className="cv-item-head">
              <div>
                <strong>{w.title}</strong> — {w.company}
                <div className="muted small">
                  {formatMonthYear(w.start_month, w.start_year)} –{" "}
                  {w.is_current
                    ? t("cv.present")
                    : formatMonthYear(w.end_month, w.end_year)}
                </div>
              </div>
              {/* Reorder + edit + delete fold into one ⋯ menu (#489): four
                  controls on the row wrapped the entry title on a phone. */}
              <div className="cv-item-actions">
                <RowMenu
                  label={t("cv.itemMenu", { title: w.title })}
                  items={[
                    {
                      label: t("cv.moveUp"),
                      disabled: i === 0,
                      onSelect: () => move(i, -1),
                    },
                    {
                      label: t("cv.moveDown"),
                      disabled: i === visible.length - 1,
                      onSelect: () => move(i, 1),
                    },
                    { label: t("common.edit"), onSelect: () => setEditing(w) },
                    {
                      label: t("common.delete"),
                      danger: true,
                      // Hidden now, committed after the undo window — the
                      // same contract as every other delete in the app.
                      onSelect: () => remove(w.id, w.title),
                    },
                  ]}
                />
              </div>
            </div>
            {w.description && <p className="notes">{w.description}</p>}
            <div className="keyword-chips">
              {w.skills.map((s) => (
                <Chip key={s.id}>
                  {s.name}
                  <button
                    onClick={() =>
                      api
                        .removeWorkExperienceSkill(w.id, s.id)
                        .then(onChanged)
                        .catch((e) => onError((e as Error).message))
                    }
                    aria-label={t("feedSettings.removeKeyword")}
                  >
                    <RemoveIcon />
                  </button>
                </Chip>
              ))}
              <input
                aria-label={t("cv.addSkill")}
                placeholder={t("cv.addSkill")}
                value={newSkill[w.id] ?? ""}
                onChange={(e) =>
                  setNewSkill((m) => ({ ...m, [w.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(w.id);
                  }
                }}
              />
            </div>
            {editing !== "new" && editing?.id === w.id && (
              <WorkExperienceForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) =>
                  run(() => api.update("work-experience", w.id, data))
                }
              />
            )}
          </CvItem>
        ))}
        {items.length === 0 && (
          <EmptyState as="li">
            <EmptyCvIcon />
            {t("cv.noWorkExperience")}
          </EmptyState>
        )}
      </ul>
      {editing === "new" ? (
        <WorkExperienceForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("work-experience", data))}
        />
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          {t("cv.addWorkExperience")}
        </Button>
      )}
    </div>
  );
}

function EducationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Education | null;
  onSubmit: (data: Partial<Education>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Education>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Education>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("cv.institution")} *
        <input
          required
          value={form.institution ?? ""}
          onChange={(e) => set({ institution: e.target.value })}
        />
      </label>
      <label>
        {t("cv.degree")}
        <input
          value={form.degree ?? ""}
          onChange={(e) => set({ degree: e.target.value })}
        />
      </label>
      <label>
        {t("cv.field")}
        <input
          value={form.field ?? ""}
          onChange={(e) => set({ field: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.endYear")}
        <input
          type="number"
          value={form.end_year ?? ""}
          onChange={(e) =>
            set({ end_year: e.target.value ? Number(e.target.value) : null })
          }
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

export function EducationSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Education[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Education | "new" | null>(null);
  const { hidden, remove } = useDeleteWithUndo(
    "education",
    onChanged,
    onError,
    notify,
  );
  const visible = items.filter((e) => !hidden.has(e.id));

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const move = (index: number, dir: -1 | 1) => {
    // Indexes into the rendered list, not the raw one: a row hidden by a
    // pending delete shifts every index after it, and reading the other list
    // here swaps the wrong pair.
    const other = visible[index + dir];
    const item = visible[index];
    if (!other) return;
    Promise.all([
      api.patch("education", item.id, { sort_order: other.sort_order }),
      api.patch("education", other.id, { sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.education")}</h3>
      <ul className="cv-list">
        {visible.map((ed, i) => (
          <CvItem key={ed.id}>
            <div className="cv-item-head">
              <div>
                <strong>{ed.institution}</strong>
                {ed.degree ? ` — ${ed.degree}` : ""}
                {ed.field ? ` (${ed.field})` : ""}
                <div className="muted small">
                  {formatMonthYear(ed.start_month, ed.start_year)} –{" "}
                  {formatMonthYear(ed.end_month, ed.end_year)}
                </div>
              </div>
              <div className="cv-item-actions">
                <RowMenu
                  label={t("cv.itemMenu", { title: ed.institution })}
                  items={[
                    {
                      label: t("cv.moveUp"),
                      disabled: i === 0,
                      onSelect: () => move(i, -1),
                    },
                    {
                      label: t("cv.moveDown"),
                      disabled: i === visible.length - 1,
                      onSelect: () => move(i, 1),
                    },
                    { label: t("common.edit"), onSelect: () => setEditing(ed) },
                    {
                      label: t("common.delete"),
                      danger: true,
                      onSelect: () =>
                        remove(ed.id, ed.institution),
                    },
                  ]}
                />
              </div>
            </div>
            {editing !== "new" && editing?.id === ed.id && (
              <EducationForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) => run(() => api.update("education", ed.id, data))}
              />
            )}
          </CvItem>
        ))}
        {items.length === 0 && <EmptyState as="li">{t("cv.noEducation")}</EmptyState>}
      </ul>
      {editing === "new" ? (
        <EducationForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("education", data))}
        />
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          {t("cv.addEducation")}
        </Button>
      )}
    </div>
  );
}

export function LanguagesSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Language[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [proficiency, setProficiency] =
    useState<Language["proficiency"]>("conversational");

  const addLanguage = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    api
      .create("languages", { name: name.trim(), proficiency })
      .then(() => {
        setName("");
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.languages")}</h3>
      <ul className="settings-list">
        {items.map((l) => (
          <li key={l.id}>
            <span>
              {l.name} — {t(`cv.proficiency.${l.proficiency}`)}
            </span>
            <Button
              variant="danger"
              className="zui-cv-language-remove"
              aria-label={t("cv.removeLanguage")}
              onClick={() =>
                api
                  .remove("languages", l.id)
                  .then(onChanged)
                  .catch((e) => onError((e as Error).message))
              }
            >
              <RemoveIcon />
            </Button>
          </li>
        ))}
        {items.length === 0 && <EmptyState as="li">{t("cv.noLanguages")}</EmptyState>}
      </ul>
      <form className="settings-add" onSubmit={addLanguage}>
        <input
          aria-label={t("cv.languageName")}
          placeholder={t("cv.languageName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label={t("cv.proficiencyLabel")}
          value={proficiency}
          onChange={(e) =>
            setProficiency(e.target.value as Language["proficiency"])
          }
        >
          <option value="conversational">{t("cv.proficiency.conversational")}</option>
          <option value="fluent">{t("cv.proficiency.fluent")}</option>
          <option value="native">{t("cv.proficiency.native")}</option>
        </select>
        <Button type="submit" variant="secondary" className="zui-cv-add-btn">
          {t("feedSettings.add")}
        </Button>
      </form>
    </div>
  );
}
