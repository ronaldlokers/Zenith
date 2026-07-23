// Application detail view extracted from App.tsx (#285 split): the full
// detail modal (ApplicationDetailModal). The Documents, interview-prep,
// cover-letter, JD-keyword, and edit-form sections it renders are the owned
// Documents/InterviewPrepSection/CoverLetterSection/JdKeywordMatch/
// ApplicationForm components (src/components) — see that split's history in
// git blame for this file. Only ApplicationDetailModal is public; the rest
// are its internals.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import {
  ActionBar,
  ApplicationForm,
  Button,
  Chip,
  CoverLetterSection,
  AiKeyGate,
  Documents,
  InterviewPrepSection,
  JdKeywordMatch,
  MockInterview,
  NegotiationRoleplay,
  StarRating,
} from "./components";
import type {
  Application,
  Company,
  Contact,
  PrepItem,
  RoleTypeDef,
  Status,
} from "./types";
import { STATUSES } from "./types";
import { salaryResearchLinks } from "./salary-research";
import { EditIcon, RemoveIcon } from "./icons";
import {
  buildNegotiationDraft,
  formatDate,
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
import { requestConfirm, useFocusTrap } from "./hooks";

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
  const navigate = useNavigate();
  const dialogRef = useFocusTrap<HTMLDivElement>(!asPane);
  const [editing, setEditing] = useState(false);
  // Which secondary-column section is shown. The detail page had grown to 7
  // stacked sections (IA review, #448) — a tab sub-nav shows one at a time,
  // mirroring the Settings section-nav, and keeps mobile off a long scroll.
  // Three intent groups (#479) instead of six peer tabs: Track (timeline +
  // documents), Prep (interview prep + AI practice), Tailor (ATS + cover
  // letter). Clusters the tools by the question you're actually asking.
  const [secTab, setSecTab] = useState<"track" | "prep" | "tailor">("prep");
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
          <div className="detail-head-main">
            <h2>{a.title}</h2>
            <span className="detail-co muted small">
              {a.company_name ?? "—"}
              {a.contact_name ? ` · ${a.contact_name}` : ""}
              {safeHref(a.url) && (
                <>
                  {" · "}
                  <a
                    href={safeHref(a.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="detail-posting-link"
                  >
                    {t("detail.jobPostingLink")}
                  </a>
                </>
              )}
            </span>
          </div>
          {!editing && (
            <div className="detail-head-right">
              <select
                className={`status-pill stage-${a.status}`}
                value={a.status}
                aria-label={t("detail.status")}
                onChange={(e) => onStatus(a.id, e.target.value as Status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`stages.${s}`)}
                  </option>
                ))}
              </select>
              <StarRating
                value={a.fit_score ?? null}
                aria-label={t("detail.fitScore")}
                disabled={patchBusy}
                starLabel={(n) => t("detail.fitSetAria", { n })}
                onChange={(next) =>
                  inlinePatch(api.patchApplication(a.id, { fit_score: next }))
                }
              />
            </div>
          )}
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
              {/* Core facts as one aligned definition list (#463) — replaces
                  the scattered label/bare-line mix. Status + fit + job posting
                  now live in the header. */}
              <dl className="detail-defs">
                <dt>{t("detail.role")}</dt>
                <dd>
                  {roleTypes.find((r) => r.slug === a.role_type)?.label ??
                    a.role_type}
                </dd>
                {a.source && (
                  <>
                    <dt>{t("forms.source")}</dt>
                    <dd>{t("detail.viaSource", { source: a.source })}</dd>
                  </>
                )}
                {a.referred_by_name && (
                  <>
                    <dt>{t("referral.referredBy")}</dt>
                    <dd>{a.referred_by_name}</dd>
                  </>
                )}
                {a.deadline_at && (
                  <>
                    <dt>{t("detail.deadline")}</dt>
                    <dd
                      className={
                        isDeadlinePast(a) || isDeadlineSoon(a) ? "warn-text" : ""
                      }
                    >
                      {formatDate(a.deadline_at)}
                    </dd>
                  </>
                )}
                {a.applied_at && (
                  <>
                    <dt>{t("forms.appliedOn")}</dt>
                    <dd>{formatDate(a.applied_at)}</dd>
                  </>
                )}
                {a.salary_range && (
                  <>
                    <dt>{t("forms.salaryRange")}</dt>
                    <dd>{a.salary_range}</dd>
                  </>
                )}
              </dl>
              {a.posting_status === "maybe_stale" && (
                <span className="muted small warn-text">
                  {t("posting.staleHint")}
                </span>
              )}
              {a.company_name && (
                <div className="salary-research">
                  <span className="salary-research-h">
                    {t("salary.research")}
                  </span>
                  <span className="salary-research-links">
                    {salaryResearchLinks(a.company_name, a.title).map((l) => (
                      <a
                        key={l.key}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="salary-research-link"
                      >
                        {t(l.labelKey)}
                      </a>
                    ))}
                  </span>
                </div>
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
                    <EditIcon />
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
                    <EditIcon />
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
              {a.job_description && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    navigate("/cv", {
                      state: { tailorJd: a.job_description },
                    })
                  }
                >
                  {t("detail.tailorForJob")}
                </button>
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

            <ActionBar variant="detail">
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
            </ActionBar>
          </div>
          <div className="detail-secondary">
            <div
              className="detail-tabs"
              role="tablist"
              aria-label={t("detail.sections")}
            >
              {(
                [
                  ["track", t("detail.tabTrack")],
                  ["prep", t("detail.tabPrep")],
                  ["tailor", t("detail.tabTailor")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`detail-tab-${key}`}
                  aria-selected={secTab === key}
                  aria-controls={`detail-panel-${key}`}
                  className={secTab === key ? "active" : ""}
                  onClick={() => setSecTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="detail-panel"
              role="tabpanel"
              id={`detail-panel-${secTab}`}
              aria-labelledby={`detail-tab-${secTab}`}
            >
              {secTab === "track" && (
                <>
                  <h3 className="detail-sub detail-sub-first">
                    {t("detail.timeline")}
                  </h3>
                  <Timeline
                    resource="applications"
                    targetId={a.id}
                    onError={onError}
                    onLogged={() => void onChanged()}
                  />
                  <h3 className="detail-sub">{t("detail.documents")}</h3>
                  <Documents applicationId={a.id} onError={onError} />
                </>
              )}

              {secTab === "prep" && (
                <>
                  <h3 className="detail-sub detail-sub-first">
                    {t("prep.title")}
                  </h3>
                  <InterviewPrepSection
                    applicationId={a.id}
                    onError={onError}
                  />

                  <h3 className="detail-sub">{t("detail.aiPractice")}</h3>
                  <p
                    className={`ai-grounding ${
                      a.job_description
                        ? "ai-grounding-ready"
                        : "ai-grounding-missing"
                    }`}
                  >
                    {a.job_description
                      ? t("ai.groundedReady")
                      : t("ai.groundedMissing")}
                  </p>

                  <h3 className="detail-sub">{t("mockInterview.title")}</h3>
                  <AiKeyGate>
                    <MockInterview
                      title={a.title}
                      company={a.company_name ?? null}
                      jobDescription={a.job_description}
                      onError={onError}
                    />
                  </AiKeyGate>

                  <h3 className="detail-sub">{t("negotiation.title")}</h3>
                  <AiKeyGate>
                    <NegotiationRoleplay
                      title={a.title}
                      company={a.company_name ?? null}
                      salaryExpectation={a.salary_range}
                      jobDescription={a.job_description}
                      onError={onError}
                    />
                  </AiKeyGate>
                </>
              )}

              {secTab === "tailor" && (
                <>
                  <h3 className="detail-sub detail-sub-first">
                    {t("detail.keywordMatch")}
                  </h3>
                  <JdKeywordMatch
                    onError={onError}
                    initialText={a.job_description ?? undefined}
                  />

                  <h3 className="detail-sub">{t("coverLetter.title")}</h3>
                  <CoverLetterSection
                    application={a}
                    onChanged={onChanged}
                    onError={onError}
                    notify={notify}
                  />
                </>
              )}
            </div>
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

