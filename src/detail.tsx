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
  OutcomeDialog,
  CoverLetterSection,
  AiKeyGate,
  Documents,
  InterviewPrepSection,
  JdKeywordMatch,
  MockInterview,
  NegotiationRoleplay,
  StarRating,
  TabBar,
} from "./components";
import type {
  Application,
  Company,
  Contact,
  Interaction,
  PrepItem,
  RoleTypeDef,
  Status,
  StatusHistoryRow,
  TerminalStatus,
} from "./types";
import { isTerminalStatus, STATUSES } from "./types";
import { salaryResearchLinks } from "./salary-research";
import { EditIcon, ExternalLinkIcon, PrintIcon, RemoveIcon } from "./icons";
import {
  buildNegotiationDraft,
  formatDate,
  isDeadlinePast,
  isDeadlineSoon,
  isDue,
  isOverdue,
  median,
  MIN_POOL_FOR_MEDIAN,
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
  history,
  onSaveOutcome,
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
  // Status history for this user, used only to read back the outcome recorded
  // on this application's latest terminal transition (#381) — the reason
  // lives on the transition, not the application row. Optional: a caller
  // without stats loaded simply shows no outcome section.
  history?: StatusHistoryRow[];
  onSaveOutcome?: (
    id: number,
    reason: string | null,
    note: string | null,
  ) => void;
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
  // Prep is the right opener while the application is live, and nonsense once
  // it is not: a rejected application opened on "Interview prep", offering a
  // mock interview and a salary-negotiation rehearsal for a job that is gone.
  // A closed application has one question left — what happened and when — so
  // it opens on Track. Initial state rather than a derived value: the tab is
  // the user's to change afterwards, and recomputing it would drag them back
  // here every time the row refetched.
  const [secTab, setSecTab] = useState<"track" | "prep" | "tailor">(
    isTerminalStatus(application.status) ? "track" : "prep",
  );
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
  // Bumped when the Track tab's timeline logs or deletes a touchpoint, so the
  // summary in the facts column refetches instead of going stale.
  const [activityKey, setActivityKey] = useState(0);
  const [negotiationDraft, setNegotiationDraft] = useState<string | null>(null);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const a = application;

  // The outcome lives on the latest terminal transition, which is also the
  // row the endpoint writes to — so read it from the same place rather than
  // from the application row. `history` arrives ordered by changed_at, and
  // the last matching row is the current closure.
  const outcomeStatus: TerminalStatus | null = isTerminalStatus(a.status)
    ? a.status
    : null;
  const outcomeRow = outcomeStatus
    ? [...(history ?? [])]
        .reverse()
        .find(
          (r) => r.application_id === a.id && isTerminalStatus(r.to_status),
        )
    : undefined;

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
        {editingOutcome && outcomeStatus && onSaveOutcome && (
          <OutcomeDialog
            status={outcomeStatus}
            initialReason={outcomeRow?.outcome_reason ?? null}
            initialNote={outcomeRow?.outcome_note ?? null}
            onClose={() => setEditingOutcome(false)}
            onSave={(reason, note) => {
              onSaveOutcome(a.id, reason, note);
              setEditingOutcome(false);
            }}
          />
        )}
        {/* The card is mounted on a plate tinted with the current stage, and
            the tools hang against the plate rather than against the viewport:
            they belong to this application, not to the page. They are
            siblings of the plate — nesting them inside it renders plausibly
            and wrong, which is exactly the bug that hit the prototype twice.
            test/detail-structure asserts the sibling relationship. */}
        <div className={`detail-stage stage-${a.status}`}>
          <div className="detail-tools detail-tools-left">
            {safeHref(a.url) && (
              <a
                className="detail-tool"
                href={safeHref(a.url)}
                target="_blank"
                rel="noreferrer"
                title={t("detail.jobPostingLink")}
                aria-label={t("detail.jobPostingLink")}
              >
                <ExternalLinkIcon />
              </a>
            )}
          </div>
          <div className="detail-plate">
            <article className="detail-card">
        {/* The identity pill floats inside the card with a margin — unlike
            the board card's strip, which is flush to its edge. */}
        <div className="detail-pill">
          <span className="detail-pill-when">
            {formatDate(a.applied_at ?? a.created_at)}
          </span>
          <span className="detail-pill-co">{a.company_name ?? "—"}</span>
        </div>
        <div className="detail-head">
          <div className="detail-head-main">
            <h2>{a.title}</h2>
            <span className="detail-co muted small">
              {a.contact_name ? `${a.contact_name} · ` : ""}
              {roleTypes.find((r) => r.slug === a.role_type)?.label ??
                a.role_type}
            </span>
          </div>
          {!editing && (
            <div className="detail-head-right">
              {/* The stage rail lives inside the card, level with the title:
                  where this stands is the first thing the page answers, and a
                  dropdown hides seven of the eight answers behind a click. */}
              {/* Buttons that each perform a move, not radios. A radio group
                  is one tab stop where the arrows move focus AND select — here
                  that would write a stage change to the history on every
                  keypress. These are individually tabbable and say which one
                  is current instead. */}
              <div
                className="detail-rail"
                role="group"
                aria-label={t("detail.status")}
              >
                {STATUSES.map((sName) => (
                  <button
                    key={sName}
                    type="button"
                    aria-pressed={a.status === sName}
                    className={`detail-rail-step stage-${sName}${a.status === sName ? " current" : ""}`}
                    onClick={() => onStatus(a.id, sName)}
                  >
                    {t(`stages.${sName}`)}
                  </button>
                ))}
              </div>
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
                {/* Why it ended (#381) — sits in the facts list because that
                    is what it is. Only for a closed application, and only
                    when the caller passed history to read it from. */}
                {outcomeStatus && onSaveOutcome && (
                  <>
                    <dt>{t("outcome.detailHeading")}</dt>
                    <dd className="detail-outcome">
                      <span className={outcomeRow?.outcome_reason ? "" : "muted"}>
                        {outcomeRow?.outcome_reason
                          ? t(`outcome.reason.${outcomeRow.outcome_reason}`)
                          : t("outcome.detailEmpty")}
                        {outcomeRow?.outcome_note
                          ? ` — ${outcomeRow.outcome_note}`
                          : ""}
                      </span>
                      <Button variant="link" onClick={() => setEditingOutcome(true)}>
                        {outcomeRow?.outcome_reason
                          ? t("outcome.detailChange")
                          : t("outcome.detailEdit")}
                      </Button>
                    </dd>
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
                  // "12% above your median tracked offer (1 others)" — a
                  // median of one value is that value, and the parenthesis
                  // gave the game away in bad grammar. The comparison is
                  // still worth stating below three; only the word median
                  // is not, so a second string states it as what it is.
                  return (
                    <span className="muted small">
                      {t(
                        pool.length >= MIN_POOL_FOR_MEDIAN
                          ? "offer.benchmark"
                          : "offer.benchmarkFew",
                        {
                          pct: Math.round(Math.abs(diffPct)),
                          direction:
                            diffPct >= 0 ? t("offer.above") : t("offer.below"),
                          n: pool.length,
                          count: pool.length,
                        },
                      )}
                    </span>
                  );
                })()}
              {a.status === "offer" && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setNegotiationDraft((cur) =>
                      cur == null ? buildNegotiationDraft(a, allApplications, t) : null,
                    )
                  }
                >
                  {negotiationDraft == null
                    ? t("offer.draftNegotiation")
                    : t("offer.hideNegotiationDraft")}
                </Button>
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFuText("");
                    setFuDate("");
                    setInlineField("followup");
                  }}
                >
                  {t("detail.setFollowUp")}
                </Button>
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNoteDraft("");
                    setInlineField("notes");
                  }}
                >
                  {t("detail.addNote")}
                </Button>
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
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate("/cv", {
                      state: { tailorJd: a.job_description },
                    })
                  }
                >
                  {t("detail.tailorForJob")}
                </Button>
              )}
            </div>

            <div className="keyword-chips">
              {a.tags.map((tg, i) => (
                <Chip key={tg.id}>
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveUpNamed", { name: tg.name })}
                    disabled={i === 0}
                    onClick={() => moveTag(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveDownNamed", { name: tg.name })}
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
                aria-label={t("detail.addTag")}
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


            {/* The facts column ran out well above the fold while the tabbed
                column kept going (#490). The last few touchpoints answer
                "where does this stand?" without a tab switch; the full log
                and the logger stay in Track. */}
            <RecentTouchpoints
              applicationId={a.id}
              refreshKey={activityKey}
              onError={onError}
              onSeeAll={() => setSecTab("track")}
            />
          </div>
          <div className="detail-secondary">
            <TabBar
              tabs={[
                { key: "track", label: t("detail.tabTrack") },
                { key: "prep", label: t("detail.tabPrep") },
                { key: "tailor", label: t("detail.tabTailor") },
              ]}
              active={secTab}
              onSelect={setSecTab}
              idPrefix="detail"
              aria-label={t("detail.sections")}
            />

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
                    onItemsChanged={() => {
                      setActivityKey((k) => k + 1);
                      void onChanged();
                    }}
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
            </article>
            <div className="detail-plate-actions">
            <ActionBar variant="detail">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
              {/* Pinning is reachable from both places the card is (#535
                  shell): the board's ⋯ menu and here. Same toggle, so the
                  way back is the same control. */}
              <Button
                variant="secondary"
                onClick={() =>
                  (a.pinned_at
                    ? api.unpinApplication(a.id)
                    : api.pinApplication(a.id)
                  )
                    .then(onChanged)
                    .catch((e) => onError((e as Error).message))
                }
              >
                {a.pinned_at ? t("board.unpin") : t("board.pin")}
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
          </div>
          <div className="detail-tools detail-tools-right">
            <button
              type="button"
              className="detail-tool"
              disabled={printingCheatSheet}
              title={t("detail.cheatSheet.print")}
              aria-label={t("detail.cheatSheet.print")}
              onClick={printCheatSheet}
            >
              <PrintIcon />
            </button>
          </div>
        </div>
      </div>
  );

  if (asPane) return pane;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      {pane}
    </div>
  );
}


// Last few touchpoints, shown in the facts column under the actions (#490).
// A read-only summary: logging and deleting stay in the Track tab's full
// timeline, which owns the same interactions — `refreshKey` re-runs the fetch
// when that timeline changes them.
function RecentTouchpoints({
  applicationId,
  refreshKey,
  onError,
  onSeeAll,
}: {
  applicationId: number;
  refreshKey: number;
  onError: (message: string | null) => void;
  onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Interaction[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .interactions("applications", applicationId)
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch((e) => onError((e as Error).message));
    return () => {
      live = false;
    };
  }, [applicationId, refreshKey, onError]);

  if (!items) return null;
  const recent = items.slice(0, 3);

  return (
    <div className="detail-recent">
      <span className="detail-recent-h">{t("detail.recentActivity")}</span>
      {recent.length === 0 ? (
        <p className="muted small detail-recent-empty">
          {t("detail.noTouchpoints")}
        </p>
      ) : (
        <ul className="detail-recent-list">
          {recent.map((it) => (
            <li key={it.id}>
              <span className="detail-recent-type">
                {t(`interactionTypes.${it.type}`)}
              </span>
              <span className="detail-recent-date">
                {formatDate(it.happened_at)}
              </span>
              {it.notes && (
                <span className="detail-recent-note muted">{it.notes}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="detail-recent-all" onClick={onSeeAll}>
        {t("detail.seeFullTimeline")}
      </button>
    </div>
  );
}
