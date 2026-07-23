// Pipeline / Board view extracted from App.tsx (#285 split): the kanban
// board (PipelineTab -> BoardTab -> BoardCard -> CardMenu) with the stage
// ring, filters, and drag-to-restage. Only PipelineTab is public.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import type {
  Application,
  Company,
  Contact,
  CrudTabProps,
  JobFilters,
  RoleTypeDef,
  SavedView,
  Status,
  StatusHistoryRow,
} from "./types";
import { ArchiveIcon, FilterIcon, SearchIcon } from "./icons";
import type { BoardSort, Urgency } from "./format";
import {
  ageDays,
  isDead,
  isOverdue,
  keyShortcutsEnabled,
  median,
  parseSqlDate,
  PIPELINE,
  sortCards,
  today,
} from "./format";
import { Dialog } from "./ui";
import { rowActivate } from "./hooks";
import { ApplicationDetailModal } from "./detail";
import { ActionBar, Button, CardMenu, FilterTab, StarRating } from "./components";

function BoardCard({
  a,
  urgency,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
  onMove,
  onSetFollowUp,
  onArchive,
}: {
  a: Application;
  urgency: Urgency;
  draggable: boolean;
  isDragging: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onOpenDetail: () => void;
  onMove: (status: string) => void;
  onSetFollowUp: (date: string | null, text: string | null) => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const actionable = urgency === "overdue" || urgency === "today";
  return (
    <article
      className={`bcard stage-${a.status} u-${urgency ?? "calm"}${isDragging ? " dragging" : ""}${a.archived_at ? " archived" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <CardMenu
        a={a}
        onMove={onMove}
        onSetFollowUp={onSetFollowUp}
        onOpenDetail={onOpenDetail}
        onArchive={onArchive}
      />
      <div className="bcard-body" {...rowActivate(onOpenDetail)}>
        <strong>
          {a.title}
          {a.fit_score ? (
            <span className="fit-stars" title={`${a.fit_score}/5`}>
              {" "}
              <StarRating value={a.fit_score} readOnly />
            </span>
          ) : null}
        </strong>
        <span className="co">
          {a.company_name ?? "—"}
          {a.contact_name ? ` · ${a.contact_name}` : ""}
        </span>
        {actionable ? (
          <span className="baction">
            → {a.next_action ?? t("detail.followUpFallback")}
            {" · "}
            {t(`urgency.${urgency}`)}
          </span>
        ) : urgency === "stale" || urgency === "quiet" ? (
          <span className={`bbadge u-${urgency}`}>{t(`attention.${urgency}`)}</span>
        ) : (
          // Freshness at a glance (design review) — so every card carries a
          // bottom metadata line, not just the actionable ones.
          <span className="bmeta">
            {t("board.updatedAge", { age: ageDays(a.updated_at) })}
          </span>
        )}
      </div>
    </article>
  );
}
function BoardTab({
  applications,
  attention,
  sort,
  companies,
  contacts,
  roleTypes,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  attention?: Map<number, Urgency>;
  sort: BoardSort;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const move = (a: Application, status: string) =>
    onStatus(a.id, status as Status);
  const urgencyOf = (a: Application): Urgency => attention?.get(a.id) ?? null;

  const setFollowUp = (
    id: number,
    date: string | null,
    text: string | null,
  ) =>
    api
      .updateFollowUp(id, { next_action: text, next_action_at: date })
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));

  const archive = (id: number) =>
    api
      .archiveApplication(id)
      .then(() => onChanged())
      .then(() =>
        notify(t("toast.archived"), () =>
          api
            .unarchiveApplication(id)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));

  const open = applications.filter((a) => !isDead(a.status));

  // Drag-and-drop is gated off on touch (#54); on touch the ⋯ menu's
  // "Move to stage" reclassifies a card instead.
  const [isCoarsePointer, setIsCoarsePointer] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setIsCoarsePointer(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Status | null>(null);
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
  const detailApp = applications.find((a) => a.id === detailId) ?? null;

  // Column counts + funnel proportion — headers carry the funnel now that
  // the ring is gone (#346).
  const stageCounts = PIPELINE.map(
    (stage) => open.filter((a) => a.status === stage).length,
  );
  const funnelBase = Math.max(1, ...stageCounts);

  const cardProps = (a: Application) => ({
    urgency: urgencyOf(a),
    onOpenDetail: () => setDetailId(a.id),
    onMove: (status: string) => move(a, status),
    onSetFollowUp: (date: string | null, text: string | null) =>
      setFollowUp(a.id, date, text),
    onArchive: () => archive(a.id),
  });

  return (
    <>
    <div className="board">
      {PIPELINE.map((stage, i) => {
        const cards = sortCards(
          open.filter((a) => a.status === stage),
          sort,
          urgencyOf,
        );
        const className = `bcol stage-${stage}${dragOverStage === stage ? " drag-over" : ""}`;
        const handleDragOver = (e: React.DragEvent) => {
          if (draggingId === null) return;
          e.preventDefault();
          setDragOverStage(stage);
        };
        const handleDragLeave = () =>
          setDragOverStage((sName) => (sName === stage ? null : sName));
        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          const id = Number(e.dataTransfer.getData("text/plain"));
          if (id) onStatus(id, stage);
          setDraggingId(null);
          setDragOverStage(null);
        };
        return (
          <div
            key={stage}
            className={className}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="bcol-head">
              {t(`stages.${stage}`)}
              <span className="n">{stageCounts[i]}</span>
            </div>
            <div className="bcol-prop" aria-hidden="true">
              <i
                className={`s-${stage}`}
                style={{ width: `${(stageCounts[i] / funnelBase) * 100}%` }}
              />
            </div>
            <div className="bcol-cards">
              {cards.map((a) => (
                <BoardCard
                  key={a.id}
                  a={a}
                  draggable={!isCoarsePointer}
                  isDragging={draggingId === a.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(a.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(a.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStage(null);
                  }}
                  {...cardProps(a)}
                />
              ))}
              {cards.length === 0 && (
                <div className="bempty">
                  {stage === "offer"
                    ? t("empty.boardKeepPushing")
                    : t("empty.boardEmpty")}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      {detailApp && (
        <ApplicationDetailModal
          key={detailApp.id}
          application={detailApp}
          allApplications={applications}
          companies={companies}
          contacts={contacts}
          roleTypes={roleTypes}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
          onStatus={onStatus}
        />
      )}
    </>
  );
}

export function PipelineTab({
  applications,
  companies,
  contacts,
  roleTypes,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  lastInteractions,
  initialQuery,
  onQueryConsumed,
  history,
  onOpenJob,
  onOpenQuickAdd,
  onOpenSampleData,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  initialQuery?: string;
  onQueryConsumed?: () => void;
  history: StatusHistoryRow[];
  lastInteractions: { application_id: number; last_at: string }[];
  onOpenJob: (id: number | null) => void;
  onOpenQuickAdd: () => void;
  onOpenSampleData: () => void;
}) {
  const { t } = useTranslation();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [query, setQuery] = useState(initialQuery ?? "");
  // Global sort applied to every column (#346), default urgency.
  const [sort, setSort] = useState<BoardSort>("urgency");
  // Filters behind a Filter button; the Archived modal replaces the old
  // Closed drawer (#346).
  const [showFilters, setShowFilters] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState<
    "all" | "rejected" | "ghosted" | "withdrawn" | "archived"
  >("all");

  // One-shot: consume the jump query then clear it upstream, so a single
  // Calendar jump doesn't re-inject the search on every later visit (#314).
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      onQueryConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Saved views (#277) — the schema keeps statusFilter/sort for
  // back-compat with views saved from the old list; the board ignores
  // them (columns are the status filter).
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [namingView, setNamingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const loadViews = useCallback(
    () =>
      api
        .savedViews()
        .then(setSavedViews)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );
  useEffect(() => {
    loadViews();
  }, [loadViews]);

  const currentFilters = (): JobFilters => ({
    query,
    statusFilter: "all",
    roleFilter,
    companyFilter,
    tagFilter,
    showArchived: false,
    sort: "updated",
  });
  const applyView = (v: SavedView) => {
    const f = v.filters;
    setQuery(f.query ?? "");
    setRoleFilter(f.roleFilter ?? "all");
    setCompanyFilter(f.companyFilter ?? "all");
    setTagFilter(f.tagFilter ?? "all");
  };
  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    api
      .createSavedView(name, currentFilters())
      .then((v) => {
        setSavedViews((vs) => [...vs, v]);
        notify(t("savedViews.saved", { name }));
        setNamingView(false);
        setNewViewName("");
      })
      .catch((e) => onError((e as Error).message));
  };
  const deleteView = (id: number) => {
    api
      .deleteSavedView(id)
      .then(() => setSavedViews((vs) => vs.filter((v) => v.id !== id)))
      .catch((e) => onError((e as Error).message));
  };
  // Compare only the fields the board still uses, so legacy views saved
  // from the old list (with status/sort) can still read as active (#314).
  const boardFields = (f: JobFilters) => ({
    query: f.query ?? "",
    roleFilter: f.roleFilter ?? "all",
    companyFilter: f.companyFilter ?? "all",
    tagFilter: f.tagFilter ?? "all",
    showArchived: !!f.showArchived,
  });
  const curFilterKey = JSON.stringify(boardFields(currentFilters()));

  // Aggregation depends only on the data, not on query/filter state — a
  // useMemo keeps the full applications×history pass off every keystroke
  // of the search box (#346).
  const { allTags, attention } = useMemo(() => {
  const allTags = [
    ...new Map(
      applications.flatMap((a) => a.tags).map((tg) => [tg.id, tg]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Worst-wins attention signal per card (#314) — overdue > stale >
  // quiet, where "quiet" compares the silence against this employer's
  // own typical gap between status changes (#142's heat logic).
  const byAppHistory = new Map<number, StatusHistoryRow[]>();
  for (const row of history) {
    const list = byAppHistory.get(row.application_id) ?? [];
    list.push(row);
    byAppHistory.set(row.application_id, list);
  }
  const lastActivity = new Map<number, number>();
  const gapsByApp = new Map<number, number[]>();
  for (const a of applications) {
    lastActivity.set(a.id, parseSqlDate(a.applied_at ?? a.created_at));
  }
  for (const [appId, rows] of byAppHistory) {
    const times = rows.map((r) => parseSqlDate(r.changed_at));
    if (times.length) lastActivity.set(appId, times[times.length - 1]);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      gaps.push((times[i] - times[i - 1]) / 86400000);
    }
    gapsByApp.set(appId, gaps);
  }
  // A logged interaction (email, call, interview) is activity too — the
  // quiet badge said "consider a nudge"; the nudge must clear it.
  for (const r of lastInteractions) {
    const ts = parseSqlDate(r.last_at);
    if (ts > (lastActivity.get(r.application_id) ?? 0)) {
      lastActivity.set(r.application_id, ts);
    }
  }
  const gapsByCompany = new Map<number, number[]>();
  for (const a of applications) {
    if (a.company_id == null) continue;
    const list = gapsByCompany.get(a.company_id) ?? [];
    list.push(...(gapsByApp.get(a.id) ?? []));
    gapsByCompany.set(a.company_id, list);
  }
  const nowMs = Date.now();
  const FALLBACK_NORM_DAYS = 7;
  const attention = new Map<number, Urgency>();
  const todayStr = today();
  for (const a of applications) {
    if (isDead(a.status) || a.archived_at) continue;
    const companyGaps =
      a.company_id != null ? (gapsByCompany.get(a.company_id) ?? []) : [];
    const norm =
      companyGaps.length >= 2
        ? (median(companyGaps) ?? FALLBACK_NORM_DAYS)
        : FALLBACK_NORM_DAYS;
    const last = lastActivity.get(a.id) ?? parseSqlDate(a.created_at);
    const daysSince = (nowMs - last) / 86400000;
    // Only flag "quiet" when the company has enough recorded history to
    // personalize the norm — the generic fallback over-fires on new
    // relationships (guard restored; #330 dropped it).
    const quiet =
      companyGaps.length >= 2 && daysSince / norm >= 1.5 && daysSince >= 5;
    // Worst-wins: overdue > due-today > posting-stale > gone-quiet (#346).
    const val: Urgency = isOverdue(a)
      ? "overdue"
      : a.next_action_at === todayStr
        ? "today"
        : a.posting_status === "maybe_stale"
          ? "stale"
          : quiet
            ? "quiet"
            : null;
    if (val) attention.set(a.id, val);
  }
  return { allTags, attention };
  }, [applications, history, lastInteractions]);

  const q = query.trim().toLowerCase();
  const filtered = applications.filter(
    (a) =>
      !a.archived_at &&
      (roleFilter === "all" || a.role_type === roleFilter) &&
      (companyFilter === "all" || String(a.company_id) === companyFilter) &&
      (tagFilter === "all" ||
        a.tags.some((tg) => String(tg.id) === tagFilter)) &&
      (!q ||
        [a.title, a.company_name, a.contact_name, a.notes, a.source]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))),
  );

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!keyShortcutsEnabled()) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilterCount =
    (roleFilter !== "all" ? 1 : 0) +
    (companyFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0);
  // Inactive jobs (closed statuses + manually archived) — the Archived
  // modal's contents, off the board entirely (#346).
  const inactive = applications
    .filter((a) => isDead(a.status) || a.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const reasonOf = (a: Application) =>
    isDead(a.status) ? (a.status as "rejected" | "withdrawn" | "ghosted") : "archived";
  const archivedTabs = [
    { key: "all" as const, n: inactive.length },
    { key: "rejected" as const, n: inactive.filter((a) => reasonOf(a) === "rejected").length },
    { key: "ghosted" as const, n: inactive.filter((a) => reasonOf(a) === "ghosted").length },
    { key: "withdrawn" as const, n: inactive.filter((a) => reasonOf(a) === "withdrawn").length },
    { key: "archived" as const, n: inactive.filter((a) => reasonOf(a) === "archived").length },
  ].filter((tobj) => tobj.key === "all" || tobj.n > 0);
  const shownArchived =
    archivedFilter === "all"
      ? inactive
      : inactive.filter((a) => reasonOf(a) === archivedFilter);

  return (
    <section>
      {applications.length === 0 && (
        <p className="pipeline-empty-hint">
          {t("empty.pipelineNoJobs")}{" "}
          <Button variant="link" onClick={onOpenQuickAdd}>
            {t("toolbar.addJob")}
          </Button>
          {" · "}
          <Button variant="link" onClick={onOpenSampleData}>
            {t("sampleData.load")}
          </Button>
        </p>
      )}

      {/* Slim bar (#346): search · filter · sort · archived · add. The
          funnel ring is gone — counts live in the column headers now. */}
      <div className="board-bar">
        <span className="board-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          type="search"
          className="search"
          aria-label={t("toolbar.searchPlaceholder")}
          placeholder={t("toolbar.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`board-bar-btn${showFilters || activeFilterCount ? " active" : ""}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <FilterIcon />
          {t("board.filterBtn")}
          {activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </button>
        <label className="board-sort" title={t("board.sortBy")}>
          <select value={sort} onChange={(e) => setSort(e.target.value as BoardSort)}>
            <option value="urgency">{t("board.sortUrgency")}</option>
            <option value="followup">{t("board.sortFollowup")}</option>
            <option value="fit">{t("board.sortFit")}</option>
            <option value="updated">{t("board.sortUpdated")}</option>
          </select>
        </label>
        <button
          type="button"
          className="board-bar-btn"
          onClick={() => setShowArchivedModal(true)}
        >
          <ArchiveIcon />
          {t("board.archivedBtn")}
          {inactive.length ? ` · ${inactive.length}` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="board-filters-pop">
          <div className="filters-fields">
            <label className="filter-field">
              <span>{t("filters.role")}</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">{t("filters.allRoles")}</option>
                {roleTypes.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t("filters.company")}</span>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="all">{t("filters.allCompanies")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {allTags.length > 0 && (
              <label className="filter-field">
                <span>{t("filters.tag")}</span>
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="all">{t("filters.allTags")}</option>
                  {allTags.map((tg) => (
                    <option key={tg.id} value={tg.id}>
                      {tg.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="filters-views-label">{t("savedViews.heading")}</div>
          <div className="saved-views">
            {savedViews.map((v) => (
              <span
                key={v.id}
                className={`view-chip${JSON.stringify(boardFields(v.filters)) === curFilterKey ? " active" : ""}`}
              >
                <button className="view-apply" onClick={() => applyView(v)}>
                  {v.name}
                </button>
                <button
                  className="view-del"
                  aria-label={t("savedViews.delete", { name: v.name })}
                  onClick={() => deleteView(v.id)}
                >
                  ×
                </button>
              </span>
            ))}
            <button className="view-save" onClick={() => setNamingView(true)}>
              {t("savedViews.save")}
            </button>
          </div>
        </div>
      )}

      {namingView && (
        <Dialog label={t("savedViews.save")} onClose={() => setNamingView(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrentView();
            }}
          >
            <label className="settings-field">
              <span>{t("savedViews.namePrompt")}</span>
              <input
                autoFocus
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
              />
            </label>
            <ActionBar variant="form">
              <Button
                type="submit"
                variant="primary"
                disabled={!newViewName.trim()}
              >
                {t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setNamingView(false)}>
                {t("common.cancel")}
              </Button>
            </ActionBar>
          </form>
        </Dialog>
      )}

      <BoardTab
        applications={filtered}
        attention={attention}
        sort={sort}
        companies={companies}
        contacts={contacts}
        roleTypes={roleTypes}
        onChanged={onChanged}
        onError={onError}
        notify={notify}
        onDelete={onDelete}
        onStatus={onStatus}
        initialDetailId={null}
        onDetailIdChange={onOpenJob}
      />

      {showArchivedModal && (
        <Dialog
          label={t("board.archivedTitle")}
          onClose={() => setShowArchivedModal(false)}
          className="archived-modal"
        >
          <div className="archived-head">
            <h2>{t("board.archivedTitle")}</h2>
            <span className="mono small muted">{inactive.length}</span>
          </div>
          {inactive.length === 0 ? (
            <p className="muted small">{t("board.noArchived")}</p>
          ) : (
            <>
            <div className="archived-tabs">
              {archivedTabs.map((tobj) => (
                <FilterTab
                  key={tobj.key}
                  active={archivedFilter === tobj.key}
                  count={tobj.n}
                  onClick={() => setArchivedFilter(tobj.key)}
                >
                  {tobj.key === "all"
                    ? t("board.archAll")
                    : t(
                        `board.reason${tobj.key[0].toUpperCase()}${tobj.key.slice(1)}`,
                      )}
                </FilterTab>
              ))}
            </div>
            <ul className="archived-list">
              {shownArchived.map((a) => {
                const reasonKey =
                  reasonOf(a) === "rejected"
                    ? "reasonRejected"
                    : reasonOf(a) === "withdrawn"
                      ? "reasonWithdrawn"
                      : reasonOf(a) === "ghosted"
                        ? "reasonGhosted"
                        : "reasonArchived";
                const restore = () =>
                  (a.archived_at
                    ? api.unarchiveApplication(a.id).then(() => onChanged())
                    : Promise.resolve(onStatus(a.id, "interested"))
                  )
                    .then(() => setShowArchivedModal(false))
                    .catch((e) => onError((e as Error).message));
                return (
                  <li key={a.id}>
                    <button
                      className="archived-open"
                      onClick={() => {
                        setShowArchivedModal(false);
                        onOpenJob(a.id);
                      }}
                    >
                      <span className="archived-title">{a.title}</span>
                      <span className="archived-co muted">
                        {a.company_name ?? "—"}
                      </span>
                    </button>
                    <span className="archived-reason">{t(`board.${reasonKey}`)}</span>
                    <button className="archived-restore" onClick={restore}>
                      {t("board.restore")} ›
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </Dialog>
      )}

    </section>
  );
}
