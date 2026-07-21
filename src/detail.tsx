// Application detail view extracted from App.tsx (#285 split): the full
// detail modal (ApplicationDetailModal) and everything it renders —
// Documents, the interview-prep / cover-letter / JD-keyword sections, and
// the edit ApplicationForm. Only ApplicationDetailModal is public; the rest
// are its internals.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { Button, Chip } from "./components";
import type {
  Application,
  Company,
  Contact,
  Document,
  PrepItem,
  RoleTypeDef,
  Skill,
  Status,
  WorkExperience,
} from "./types";
import { STATUSES } from "./types";
import { ErrorIcon, RemoveIcon } from "./icons";
import {
  buildNegotiationDraft,
  formatDate,
  isDead,
  isDeadlinePast,
  isDeadlineSoon,
  isDue,
  isOverdue,
  median,
  safeHref,
  totalComp,
  totalCompBreakdown,
} from "./format";
import { Timeline } from "./timeline";
import { requestConfirm, useFocusTrap, useSubmitGuard } from "./hooks";

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
  const { t } = useTranslation();
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
          placeholder={t("documents.labelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className={`upload-btn${busy ? " busy" : ""}`}>
          {busy ? t("documents.uploading") : t("detail.attachFile")}
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
              aria-label={t("common.delete")}
              onClick={async () => {
                if (
                  await requestConfirm(
                    t("confirm.deleteDocument", { name: d.filename }),
                  )
                )
                  api
                    .remove("documents", d.id)
                    .then(load)
                    .catch((e) => onError((e as Error).message));
              }}
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items?.length === 0 && <li className="tl-empty">{t("detail.noFiles")}</li>}
      </ul>
    </div>
  );
}

const PREP_STARTER_ITEMS = [
  "prep.starterResearch",
  "prep.starterQuestions",
  "prep.starterJd",
  "prep.starterStories",
] as const;

function InterviewPrepSection({
  applicationId,
  onError,
}: {
  applicationId: number;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [newText, setNewText] = useState("");

  const load = useCallback(
    () =>
      api
        .list<PrepItem>(`applications/${applicationId}/prep-items`)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const [adding, setAdding] = useState(false);
  const addItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    api
      .create(`applications/${applicationId}/prep-items`, { text: trimmed })
      .then(() => {
        setNewText("");
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setAdding(false));
  };

  const toggleDone = (item: PrepItem) =>
    api
      .update("prep-items", item.id, { done: !item.done })
      .then(load)
      .catch((e) => onError((e as Error).message));

  const removeItem = (id: number) =>
    api
      .remove("prep-items", id)
      .then(load)
      .catch((e) => onError((e as Error).message));

  // Reorder via sort_order swap (#207) — same pattern as the CV
  // sections (#94) rather than native drag, which is deliberately
  // gated off on touch input elsewhere in this app (see Board, #54).
  const moveItem = (index: number, dir: -1 | 1) => {
    if (!items) return;
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("prep-items", item.id, { sort_order: other.sort_order }),
      api.update("prep-items", other.id, { sort_order: item.sort_order }),
    ])
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  const addStarterChecklist = () => {
    Promise.all(
      PREP_STARTER_ITEMS.map((key) =>
        api.create(`applications/${applicationId}/prep-items`, {
          text: t(key),
        }),
      ),
    )
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  if (!items) return null;

  return (
    <div className="prep-checklist">
      {items.length === 0 && (
        <button onClick={addStarterChecklist}>
          {t("prep.addStarterChecklist")}
        </button>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={!!item.done}
                onChange={() => toggleDone(item)}
              />
              {item.text}
            </label>
            <span className="prep-item-actions">
              <button
                aria-label={t("cv.moveUp")}
                disabled={i === 0}
                onClick={() => moveItem(i, -1)}
              >
                ↑
              </button>
              <button
                aria-label={t("cv.moveDown")}
                disabled={i === items.length - 1}
                onClick={() => moveItem(i, 1)}
              >
                ↓
              </button>
              <button
                className="danger"
                onClick={() => removeItem(item.id)}
                aria-label={t("common.delete")}
              >
                <RemoveIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="prep-add">
        <input
          placeholder={t("prep.addItemPlaceholder")}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem(newText);
            }
          }}
        />
        <button disabled={adding} onClick={() => addItem(newText)}>
          {t("common.add")}
        </button>
      </div>
    </div>
  );
}

function CoverLetterSection({
  application,
  onChanged,
  onError,
  notify,
}: {
  application: Application;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(application.cover_letter ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(application.cover_letter ?? "");
  }, [application.id, application.cover_letter]);

  const [generating, setGenerating] = useState(false);
  const generate = () => {
    if (generating) return;
    setGenerating(true);
    api
      .profile()
      .then((profile) => {
        const company = application.company_name ?? t("coverLetter.theCompany");
        const greeting = t("coverLetter.greeting", { company });
        const body = t("coverLetter.body", {
          title: application.title,
          company,
          summary: profile.summary ?? t("coverLetter.summaryPlaceholder"),
        });
        const signoff = t("coverLetter.signoff", {
          name: profile.name ?? t("coverLetter.namePlaceholder"),
        });
        setText(`${greeting}\n\n${body}\n\n${signoff}`);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setGenerating(false));
  };

  const save = () => {
    setSaving(true);
    api
      .update("applications", application.id, { ...application, cover_letter: text })
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="cover-letter">
      <div className="cover-letter-actions">
        <button onClick={generate} disabled={generating}>
          {t("coverLetter.generateDraft")}
        </button>
        <Button variant="primary" disabled={saving} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
      <textarea
        rows={10}
        placeholder={t("coverLetter.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

function JdKeywordMatch({
  onError,
  initialText,
}: {
  onError: (message: string | null) => void;
  initialText?: string;
}) {
  const { t } = useTranslation();
  const [jdText, setJdText] = useState(initialText ?? "");
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [cvSkillNames, setCvSkillNames] = useState<Set<string> | null>(null);

  const load = () => {
    if (skills) return;
    Promise.all([
      api.list<Skill>("skills"),
      api.list<WorkExperience>("work-experience"),
    ])
      .then(([allSkills, workExp]) => {
        setSkills(allSkills);
        setCvSkillNames(
          new Set(
            workExp.flatMap((w) => w.skills.map((s) => s.name.toLowerCase())),
          ),
        );
      })
      .catch((e) => onError((e as Error).message));
  };

  useEffect(() => {
    if (initialText) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jdLower = jdText.toLowerCase();
  const mentioned =
    jdText.trim() && skills
      ? skills.filter((s) => {
          const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(jdLower);
        })
      : [];
  const matched = mentioned.filter((s) =>
    cvSkillNames?.has(s.name.toLowerCase()),
  );

  return (
    <div className="jd-match">
      <textarea
        className="jd-match-input"
        placeholder={t("detail.pasteJdPlaceholder")}
        value={jdText}
        onFocus={load}
        onChange={(e) => setJdText(e.target.value)}
        rows={4}
      />
      {jdText.trim() && skills && (
        <div className="jd-match-result">
          <strong>
            {t("detail.keywordMatchCount", {
              matched: matched.length,
              total: mentioned.length,
            })}
          </strong>
          <div className="keyword-chips">
            {mentioned.map((s) => (
              <Chip key={s.id} matched={matched.includes(s)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApplicationDetailModal({
  application,
  allApplications,
  companies,
  contacts,
  roleTypes,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  asPane,
}: {
  application: Application;
  allApplications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
  onStatus: (id: number, status: Status) => void;
  // Split-pane mode (#131) — rendered inline in the Jobs sidebar on wide
  // desktop viewports instead of an overlay modal. Same content either
  // way; only the outer wrapper (backdrop, click-outside-to-close,
  // Escape-to-close) differs.
  asPane?: boolean;
}) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>(!asPane);
  const [editing, setEditing] = useState(false);
  const [inlineField, setInlineField] = useState<null | "followup" | "notes">(
    null,
  );
  const [fuText, setFuText] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const inlinePatch = (req: Promise<unknown>) => {
    if (patchBusy) return;
    setPatchBusy(true);
    return req
      .then(() => {
        setInlineField(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setPatchBusy(false));
  };
  const [newTag, setNewTag] = useState("");
  const [negotiationDraft, setNegotiationDraft] = useState<string | null>(null);
  const a = application;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (inlineField) {
        // Close just the small inline editor — not the whole panel.
        setInlineField(null);
      } else if (editing) {
        // The full form holds ~20 fields; Escape used to discard them
        // silently (modal) or do nothing (page).
        void requestConfirm(t("confirm.discardEdit")).then((ok) => {
          if (ok) setEditing(false);
        });
      } else if (!asPane) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asPane, editing, inlineField, t]);

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;
    api
      .addApplicationTag(a.id, name)
      .then(() => {
        setNewTag("");
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  // Reorder via sort_order swap (#207), same pattern as prep items and
  // the CV sections (#94) — array index doubles as the new sort key
  // since a.tags already arrives ordered by sort_order.
  const moveTag = (index: number, dir: -1 | 1) => {
    const other = a.tags[index + dir];
    const item = a.tags[index];
    if (!other) return;
    Promise.all([
      api.reorderApplicationTag(a.id, item.id, index + dir),
      api.reorderApplicationTag(a.id, other.id, index),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  const [printingCheatSheet, setPrintingCheatSheet] = useState(false);
  const printCheatSheet = async () => {
    setPrintingCheatSheet(true);
    try {
      const company = companies.find((c) => c.id === a.company_id) ?? null;
      const contact = contacts.find((c) => c.id === a.contact_id) ?? null;
      const [prepItems, interactions] = await Promise.all([
        api.list<PrepItem>(`applications/${a.id}/prep-items`),
        api.interactions("applications", a.id),
      ]);
      const { generateInterviewCheatSheet } = await import("./pdf");
      const doc = generateInterviewCheatSheet(
        {
          title: a.title,
          companyName: company?.name ?? a.company_name ?? null,
          companyWebsite: company?.website ?? null,
          companyDescription: company?.description ?? null,
          contactName: contact?.name ?? a.contact_name ?? null,
          contactRole: contact?.role ?? null,
          contactEmail: contact?.email ?? null,
          contactPhone: contact?.phone ?? null,
          notes: a.notes,
          prepItems,
          interactions,
        },
        {
          contact: t("detail.cheatSheet.contact"),
          companyResearch: t("detail.cheatSheet.companyResearch"),
          prepChecklist: t("prep.title"),
          pastInteractions: t("detail.timeline"),
          noNotes: t("detail.cheatSheet.noNotes"),
        },
      );
      doc.save(`${a.title.replace(/\s+/g, "-")}-cheat-sheet.pdf`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPrintingCheatSheet(false);
    }
  };

  const pane = (
      <div
        ref={dialogRef}
        className={asPane ? "detail-pane" : "modal detail-modal"}
        onClick={asPane ? undefined : (e) => e.stopPropagation()}
        role={asPane ? "region" : "dialog"}
        aria-modal={asPane ? undefined : true}
        aria-label={a.title}
      >
        <div className="detail-head">
          <div>
            <h2>{a.title}</h2>
            <span className="muted small">
              {a.company_name ?? "—"}
              {a.contact_name ? ` · ${a.contact_name}` : ""}
            </span>
          </div>
          {!asPane && (
            <Button variant="close" onClick={onClose} aria-label={t("common.close")}>
              ×
            </Button>
          )}
        </div>

        {editing ? (
          <ApplicationForm
            initial={a}
            companies={companies}
            contacts={contacts}
            roleTypes={roleTypes}
            applications={allApplications}
            onError={onError}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("applications", a.id, data)
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
          {/* Two-column job page (#314): facts/actions left, content
              sections right — CSS collapses this to one column in the
              modal/narrow contexts. */}
          <div className="detail-cols">
          <div className="detail-primary">
            <div className="detail-fields">
              <div>
                <span className="field-label">{t("detail.status")}</span>
                <select
                  className={`status stage-${a.status}`}
                  value={a.status}
                  onChange={(e) => onStatus(a.id, e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`stages.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="field-label">{t("detail.role")}</span>
                <span className="muted small">
                  {roleTypes.find((r) => r.slug === a.role_type)?.label ??
                    a.role_type}
                </span>
              </div>
              <div>
                <span className="field-label" id={`fit-label-${a.id}`}>
                  {t("detail.fitScore")}
                </span>
                <span
                  className="fit-edit"
                  role="radiogroup"
                  aria-labelledby={`fit-label-${a.id}`}
                  onKeyDown={(e) => {
                    // Arrow/Home/End move the rating like a real radiogroup
                    // (#346) — the stars were five separate toggles before.
                    const cur = a.fit_score ?? 0;
                    let next: number | null = null;
                    if (e.key === "ArrowRight" || e.key === "ArrowUp")
                      next = Math.min(5, (cur || 0) + 1);
                    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
                      next = Math.max(1, (cur || 1) - 1);
                    else if (e.key === "Home") next = 1;
                    else if (e.key === "End") next = 5;
                    else return;
                    e.preventDefault();
                    if (next !== cur && !patchBusy)
                      inlinePatch(
                        api.patchApplication(a.id, { fit_score: next }),
                      );
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const checked = (a.fit_score ?? 0) === n;
                    // Roving tabindex: only the checked star (or the first,
                    // when unset) is tabbable; arrows move within the group.
                    const tabbable = checked || (!a.fit_score && n === 1);
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={tabbable ? 0 : -1}
                        disabled={patchBusy}
                        className={`fit-star${(a.fit_score ?? 0) >= n ? " on" : ""}`}
                        aria-label={t("detail.fitSetAria", { n })}
                        onClick={() =>
                          inlinePatch(
                            api.patchApplication(a.id, {
                              fit_score: a.fit_score === n ? null : n,
                            }),
                          )
                        }
                      >
                        ★
                      </button>
                    );
                  })}
                </span>
              </div>
              {safeHref(a.url) && (
                <a href={safeHref(a.url)} target="_blank" rel="noreferrer" className="small">
                  {t("detail.jobPostingLink")}
                </a>
              )}
              {a.source && <span className="muted small">{t("detail.viaSource", { source: a.source })}</span>}
              {a.posting_status === "maybe_stale" && (
                <span className="muted small warn-text">
                  {t("posting.staleHint")}
                </span>
              )}
              {a.referred_by_name && (
                <span className="muted small">
                  {t("referral.referredBy")}: {a.referred_by_name}
                </span>
              )}
              {a.deadline_at && (
                <span
                  className={`small${isDeadlinePast(a) ? " warn-text" : isDeadlineSoon(a) ? " warn-text" : ""}`}
                >
                  {t("detail.deadline")}: {formatDate(a.deadline_at)}
                </span>
              )}
              {a.salary_range && (
                <span className="muted small">{a.salary_range}</span>
              )}
              {a.status === "offer" && totalComp(a) != null && (
                <span className="muted small" title={totalCompBreakdown(a)}>
                  {t("offer.totalComp")}: ~
                  {a.salary_currency ?? ""}{" "}
                  {Math.round(totalComp(a)!).toLocaleString()}
                </span>
              )}
              {a.status === "offer" &&
                totalComp(a) != null &&
                (() => {
                  const others = allApplications.filter(
                    (o) =>
                      o.id !== a.id &&
                      o.status === "offer" &&
                      totalComp(o) != null,
                  );
                  const sameRole = others.filter(
                    (o) => o.role_type === a.role_type,
                  );
                  const pool = sameRole.length ? sameRole : others;
                  if (!pool.length) return null;
                  const med = median(pool.map((o) => totalComp(o)!));
                  if (med == null || med === 0) return null;
                  const diffPct = ((totalComp(a)! - med) / med) * 100;
                  return (
                    <span className="muted small">
                      {t("offer.benchmark", {
                        pct: Math.round(Math.abs(diffPct)),
                        direction:
                          diffPct >= 0 ? t("offer.above") : t("offer.below"),
                        n: pool.length,
                      })}
                    </span>
                  );
                })()}
              {a.status === "offer" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setNegotiationDraft((cur) =>
                      cur == null ? buildNegotiationDraft(a, allApplications, t) : null,
                    )
                  }
                >
                  {negotiationDraft == null
                    ? t("offer.draftNegotiation")
                    : t("offer.hideNegotiationDraft")}
                </button>
              )}
              {negotiationDraft != null && (
                <div className="negotiation-draft">
                  <textarea
                    rows={8}
                    value={negotiationDraft}
                    onChange={(e) => setNegotiationDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(negotiationDraft)}
                  >
                    {t("offer.copyDraft")}
                  </button>
                </div>
              )}
              {a.applied_at && (
                <span className="muted small">
                  {t("detail.appliedDate", { date: formatDate(a.applied_at) })}
                </span>
              )}
              {inlineField === "followup" ? (
                <form
                  className="inline-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inlinePatch(
                      api.updateFollowUp(a.id, {
                        next_action: fuText.trim() || null,
                        next_action_at: fuDate || null,
                      }),
                    );
                  }}
                >
                  <input
                    value={fuText}
                    onChange={(e) => setFuText(e.target.value)}
                    placeholder={t("detail.followUpFallback")}
                    autoFocus
                  />
                  <input
                    type="date"
                    value={fuDate}
                    onChange={(e) => setFuDate(e.target.value)}
                  />
                  <div className="inline-edit-actions">
                    <Button type="submit" variant="primary" disabled={patchBusy}>
                      {t("common.save")}
                    </Button>
                    <button type="button" onClick={() => setInlineField(null)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : a.next_action || a.next_action_at ? (
                <span
                  className={`due-line${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
                >
                  → {a.next_action ?? t("detail.followUpFallback")}
                  {a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}
                  <button
                    type="button"
                    className="inline-edit-open"
                    aria-label={t("detail.editFollowUp")}
                    onClick={() => {
                      setFuText(a.next_action ?? "");
                      setFuDate(a.next_action_at?.slice(0, 10) ?? "");
                      setInlineField("followup");
                    }}
                  >
                    ✎
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFuText("");
                    setFuDate("");
                    setInlineField("followup");
                  }}
                >
                  {t("detail.setFollowUp")}
                </button>
              )}
              {inlineField === "notes" ? (
                <form
                  className="inline-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inlinePatch(
                      api.patchApplication(a.id, {
                        notes: noteDraft.trim() || null,
                      }),
                    );
                  }}
                >
                  <textarea
                    rows={4}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    autoFocus
                  />
                  <div className="inline-edit-actions">
                    <Button type="submit" variant="primary" disabled={patchBusy}>
                      {t("common.save")}
                    </Button>
                    <button type="button" onClick={() => setInlineField(null)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : a.notes ? (
                <p className="notes">
                  {a.notes}
                  <button
                    type="button"
                    className="inline-edit-open"
                    aria-label={t("detail.editNotes")}
                    onClick={() => {
                      setNoteDraft(a.notes ?? "");
                      setInlineField("notes");
                    }}
                  >
                    ✎
                  </button>
                </p>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setNoteDraft("");
                    setInlineField("notes");
                  }}
                >
                  {t("detail.addNote")}
                </button>
              )}
              {a.job_description && (
                <details className="jd-snapshot">
                  <summary>
                    {t("detail.jobDescription")}
                    {a.job_description_captured_at && (
                      <span className="muted small">
                        {" "}
                        —{" "}
                        {t("detail.jobDescriptionCaptured", {
                          date: formatDate(a.job_description_captured_at),
                        })}
                      </span>
                    )}
                  </summary>
                  <p className="notes">{a.job_description}</p>
                </details>
              )}
            </div>

            <div className="keyword-chips">
              {a.tags.map((tg, i) => (
                <Chip key={tg.id}>
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveUp")}
                    disabled={i === 0}
                    onClick={() => moveTag(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveDown")}
                    disabled={i === a.tags.length - 1}
                    onClick={() => moveTag(i, 1)}
                  >
                    ↓
                  </button>
                  {tg.name}
                  <button
                    onClick={() =>
                      api
                        .removeApplicationTag(a.id, tg.id)
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
                placeholder={t("detail.addTag")}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
            </div>

            <div className="detail-actions">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
              <Button variant="secondary" disabled={printingCheatSheet} onClick={printCheatSheet}>
                {printingCheatSheet
                  ? t("detail.cheatSheet.printing")
                  : t("detail.cheatSheet.print")}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  (a.archived_at
                    ? api.unarchiveApplication(a.id)
                    : api.archiveApplication(a.id)
                  )
                    .then(onChanged)
                    .catch((e) => onError((e as Error).message))
                }
              >
                {a.archived_at
                  ? t("detail.unarchive")
                  : t("detail.archive")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete("applications", a.id, a.title);
                  onClose();
                }}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
          <div className="detail-secondary">
            <h3 className="detail-sub">{t("prep.title")}</h3>
            <InterviewPrepSection applicationId={a.id} onError={onError} />

            <h3 className="detail-sub">{t("coverLetter.title")}</h3>
            <CoverLetterSection
              application={a}
              onChanged={onChanged}
              onError={onError}
              notify={notify}
            />

            <h3 className="detail-sub">{t("detail.keywordMatch")}</h3>
            <JdKeywordMatch
              onError={onError}
              initialText={a.job_description ?? undefined}
            />

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline
              resource="applications"
              targetId={a.id}
              onError={onError}
              onLogged={() => void onChanged()}
            />

            <h3 className="detail-sub">{t("detail.documents")}</h3>
            <Documents applicationId={a.id} onError={onError} />
          </div>
          </div>
          </>
        )}
      </div>
  );

  if (asPane) return pane;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      {pane}
    </div>
  );
}

// Quick-add sheet (#314) — the FAB opens four fields, not the 23-field
// full form. "Add & open" lands on the new job's detail page where
// everything else lives.

function ApplicationForm({
  initial,
  companies,
  contacts,
  roleTypes,
  applications,
  onSubmit,
  onCancel,
  onError,
}: {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  applications?: Application[];
  onSubmit: (data: Partial<Application>) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
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

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
