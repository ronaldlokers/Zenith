// Pipeline / Board view extracted from App.tsx (#285 split): the kanban
// board (PipelineTab -> BoardTab -> BoardCard -> CardMenu) with the stage
// ring, filters, and drag-to-restage. Only PipelineTab is public.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
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
import { FilterIcon, FoldIcon, SearchIcon } from "./icons";
import type { BoardRail, BoardSort, Urgency } from "./format";
import {
  ageDays,
  BOARD_RAILS,
  readFoldCache,
  writeFoldCache,
  formatDate,
  DEFAULT_FOLDED,
  isDead,
  isOverdue,
  keyShortcutsEnabled,
  median,
  parseSqlDate,
  PIPELINE,
  railOf,
  sortCards,
  today,
  totalComp,
} from "./format";
import { Dialog } from "./ui";
import { rowActivate } from "./hooks";
import { ApplicationDetailModal } from "./detail";
import { ActionBar, Button, CardMenu, EmptyState, StarRating } from "./components";

// A stable empty set, so the narrow board does not allocate one per render
// and re-run everything downstream of it.
const EMPTY_FOLD: ReadonlySet<BoardRail> = new Set();

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
  onUnarchive,
  onTogglePin,
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
  onUnarchive: () => void;
  onTogglePin: () => void;
}) {
  const { t } = useTranslation();
  const actionable = urgency === "overdue" || urgency === "today";
  return (
    <article
      className={`bcard stage-${a.status} u-${urgency ?? "calm"}${isDragging ? " dragging" : ""}${a.archived_at ? " archived" : ""}${a.pinned_at ? " pinned" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {/* The pinned state has to be legible on the card itself, not only in
          the menu that toggles it. The dot is decorative — the text beside
          it is what a screen reader gets. */}
      {a.pinned_at && <span className="sr-only">{t("bottomBar.pinned")}</span>}
      <CardMenu
        a={a}
        onMove={onMove}
        onSetFollowUp={onSetFollowUp}
        onOpenDetail={onOpenDetail}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onTogglePin={onTogglePin}
      />
      <div className="bcard-body" {...rowActivate(onOpenDetail)}>
        {/* Identity strip, flush to the card edge: when it started, who it is
            with, and what kind of role. Every cell is a block — padding on an
            inline span does not indent what follows it. */}
        <div className="bstrip">
          <span className="bwhen">
            {formatDate(a.applied_at ?? a.created_at)}
          </span>
          <span className="bco">
            {a.company_name ?? "—"}
            {a.contact_name ? ` · ${a.contact_name}` : ""}
          </span>
        </div>
        <h3 className="btitle">{a.title}</h3>
        <div className="bfoot">
          <i className="dot" aria-hidden="true" />
          {actionable ? (
            <span
              className="baction"
              title={a.next_action ?? t("detail.followUpFallback")}
            >
              {a.next_action ?? t("detail.followUpFallback")}
              {" · "}
              {t(`urgency.${urgency}`)}
            </span>
          ) : urgency === "stale" || urgency === "quiet" ? (
            <span className={`bbadge u-${urgency}`}>
              {t(`attention.${urgency}`)}
            </span>
          ) : a.status === "offer" && totalComp(a) != null ? (
            // Offer is the win state — surface the comp figure (serif, #464)
            // rather than the generic freshness line.
            <span className="comp">
              ~{a.salary_currency ?? "\u20ac"}{" "}
              {Math.round(totalComp(a)!).toLocaleString()}
            </span>
          ) : (
            // Freshness at a glance (design review) — so every card carries a
            // bottom metadata line, not just the actionable ones.
            <span className="bmeta">
              {t("board.updatedAge", { age: ageDays(a.updated_at) })}
            </span>
          )}
          {a.fit_score ? (
            <span className="bfit" title={`${a.fit_score}/5`}>
              <StarRating value={a.fit_score} readOnly />
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
function BoardTab({
  applications,
  pinnedOnly,
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
  history,
  onSaveOutcome,
  initialDetailId,
  onDetailIdChange,
  folded,
  onToggleFold,
  onAdd,
  showAddBlocks,
}: CrudTabProps & {
  applications: Application[];
  /** True when the bottom bar's Pinned slot is filtering the board. */
  pinnedOnly: boolean;
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  // Passed straight through to the detail pane, which reads the outcome
  // recorded on the latest terminal transition off it (#381).
  history: StatusHistoryRow[];
  onSaveOutcome: (id: number, reason: string | null, note: string | null) => void;
  attention?: Map<number, Urgency>;
  sort: BoardSort;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
  folded: ReadonlySet<BoardRail>;
  onToggleFold: (rail: BoardRail) => void;
  onAdd: (stage: Status) => void;
  // False on a board with nothing on it yet: the add blocks are for filing
  // into a particular stage, which only means something once there is a
  // board to work. Five identical primary buttons and no cards is a
  // first-run screen shouting the same thing five times.
  showAddBlocks: boolean;
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

  const togglePin = (a: Application) =>
    (a.pinned_at ? api.unpinApplication(a.id) : api.pinApplication(a.id))
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));

  const unarchive = (id: number) =>
    api
      .unarchiveApplication(id)
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));

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
  // Below 900px the board is a carousel of one stage at a time, so folding
  // does not apply there: the strip is the navigation, and a rail folded on
  // the laptop must not hide a stage on the phone.
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia("(max-width: 899px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const onChange = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverRail, setDragOverRail] = useState<BoardRail | null>(null);
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

  // One bucket per rail, filled in a single pass. Every application lands on
  // exactly one rail (railOf resolves archived-and-rejected), so the counts
  // add up to the filtered set no matter which rails are folded.
  const byRail = new Map<BoardRail, Application[]>(
    BOARD_RAILS.map((r) => [r, [] as Application[]]),
  );
  for (const a of applications) byRail.get(railOf(a))?.push(a);
  const countOf = (rail: BoardRail) => byRail.get(rail)?.length ?? 0;
  // The funnel proportion compares the live stages against each other; the
  // closed rails are not steps in it, so they carry no bar.
  const funnelBase = Math.max(1, ...PIPELINE.map(countOf));

  const shownFolded = isNarrow ? EMPTY_FOLD : folded;

  // Carousel plumbing for the narrow board. Scrolling is driven by
  // scrollLeft rather than scrollIntoView: scrollIntoView also nudges every
  // scrollable ancestor, which shifts the whole page sideways by a few
  // pixels on the way.
  const trackRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<BoardRail, HTMLElement>());
  const stripRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<BoardRail, HTMLElement>());
  const [activeRail, setActiveRail] = useState<BoardRail>(BOARD_RAILS[0]);
  const scrollToRail = useCallback((rail: BoardRail) => {
    const track = trackRef.current;
    const col = colRefs.current.get(rail);
    if (!track || !col) return;
    setActiveRail(rail);
    // Matches the CSS snap inset, so a tap on the strip lands a column
    // exactly where a swipe does.
    track.scrollLeft = col.offsetLeft - track.clientWidth * 0.09;
  }, []);
  // Which stage you are on follows the scroll, so a swipe and a tap on the
  // strip cannot disagree about it.
  const onTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best: BoardRail = BOARD_RAILS[0];
    let bestDist = Infinity;
    for (const [rail, el] of colRefs.current) {
      const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = rail;
      }
    }
    setActiveRail(best);
  };
  // The strip follows the board, however the board was moved — a swipe that
  // left the active chip off-screen would strand the navigation.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = chipRefs.current.get(activeRail);
    if (!strip || !chip) return;
    strip.scrollLeft =
      chip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2;
  }, [activeRail, isNarrow]);

  useEffect(() => {
    if (!isNarrow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      const i = BOARD_RAILS.indexOf(activeRail);
      const next = BOARD_RAILS[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      scrollToRail(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNarrow, activeRail, scrollToRail]);

  // The grid is data-driven — a folded rail is a fixed sliver and an open
  // column takes an equal share of what is left — so the track list cannot
  // live in the stylesheet.
  const trackList = BOARD_RAILS.map((r) =>
    shownFolded.has(r) ? "var(--rail-w)" : "minmax(0, 1fr)",
  ).join(" ");

  const cardProps = (a: Application) => ({
    urgency: urgencyOf(a),
    onOpenDetail: () => setDetailId(a.id),
    onMove: (status: string) => move(a, status),
    onSetFollowUp: (date: string | null, text: string | null) =>
      setFollowUp(a.id, date, text),
    onArchive: () => archive(a.id),
    onUnarchive: () => unarchive(a.id),
    onTogglePin: () => togglePin(a),
  });

  return (
    <>
    {/* A group of buttons, not a tablist. Every column is rendered and the
        neighbours are deliberately visible at the edges, so nothing here
        selects a panel and hides the rest — the strip says where the board is
        scrolled to and scrolls it somewhere else. Announcing "tab 4 of 9,
        selected" would promise a panel that does not exist. */}
    {isNarrow && (
      <div
        className="stage-strip"
        role="group"
        aria-label={t("board.stageStrip")}
        ref={stripRef}
      >
        {BOARD_RAILS.map((rail) => (
          <button
            key={rail}
            ref={(el) => {
              if (el) chipRefs.current.set(rail, el);
              else chipRefs.current.delete(rail);
            }}
            type="button"
            aria-current={activeRail === rail ? "true" : undefined}
            className={`stage-chip stage-${rail} rail-${rail}${activeRail === rail ? " active" : ""}`}
            onClick={() => scrollToRail(rail)}
          >
            {rail === "archived" ? t("board.railArchived") : t(`stages.${rail}`)}{" "}
            <span className="n">{countOf(rail)}</span>
          </button>
        ))}
      </div>
    )}
    {pinnedOnly && applications.length === 0 && (
      /* Pressing Pinned with nothing pinned rendered eight empty columns and
         a toast, which reads as a broken board rather than an empty set.
         Says where pins come from, since the control that makes one is
         inside a menu. */
      <EmptyState className="board-empty-pinned">
        {t("board.nothingPinned")}
      </EmptyState>
    )}
    <div
      className="board"
      ref={trackRef}
      onScroll={isNarrow ? onTrackScroll : undefined}
      style={isNarrow ? undefined : { gridTemplateColumns: trackList }}
    >
      {BOARD_RAILS.map((rail) => {
        const isFolded = shownFolded.has(rail);
        const count = countOf(rail);
        const label =
          rail === "archived" ? t("board.railArchived") : t(`stages.${rail}`);
        // Dropping onto the archive rail archives; dragging back out of it
        // restores. Both are the same gesture as a stage change, so neither
        // gets a confirmation the stage move does not have.
        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          setDraggingId(null);
          setDragOverRail(null);
          const id = Number(e.dataTransfer.getData("text/plain"));
          if (!id) return;
          const dragged = applications.find((a) => a.id === id);
          if (!dragged || railOf(dragged) === rail) return;
          if (rail === "archived") return void archive(id);
          if (dragged.archived_at) void unarchive(id);
          if (dragged.status !== rail) onStatus(id, rail);
        };
        const dropProps = {
          onDragOver: (e: React.DragEvent) => {
            if (draggingId === null) return;
            e.preventDefault();
            setDragOverRail(rail);
          },
          onDragLeave: () =>
            setDragOverRail((cur) => (cur === rail ? null : cur)),
          onDrop: handleDrop,
        };
        const over = dragOverRail === rail ? " drag-over" : "";

        // A folded rail is still a drop target: the label turns on its side
        // so the horizontal room goes to the stages being worked in, but the
        // stage stays reachable without unfolding it first.
        if (isFolded) {
          return (
            <button
              key={rail}
              type="button"
              className={`bcol-rail rail-${rail} stage-${rail}${over}`}
              aria-expanded="false"
              aria-label={t("board.unfoldRail", { stage: label, count })}
              onClick={() => onToggleFold(rail)}
              {...dropProps}
            >
              <span className="n" aria-hidden="true">
                {count}
              </span>
              <span className="vlabel" aria-hidden="true">
                {label}
              </span>
            </button>
          );
        }

        const cards = sortCards(byRail.get(rail) ?? [], sort, urgencyOf);
        const live = !isDead(rail as Status) && rail !== "archived";
        return (
          <div
            key={rail}
            ref={(el) => {
              if (el) colRefs.current.set(rail, el);
              else colRefs.current.delete(rail);
            }}
            className={`bcol rail-${rail} stage-${rail}${over}`}
            {...dropProps}
          >
            {/* The stage is a heading: without it the board hands a screen
                reader fifteen card titles and no structure to hang them on,
                and the outline skips h1 straight to h3. */}
            <h2 className="bcol-head">
              <button
                type="button"
                className="bcol-fold"
                aria-expanded="true"
                aria-label={t("board.foldRail", { stage: label })}
                onClick={() => onToggleFold(rail)}
              >
                <FoldIcon />
                {label}
              </button>
              <span className="n">{count}</span>
            </h2>
            {live && (
              <div className="bcol-prop" aria-hidden="true">
                <i
                  className={`s-${rail}`}
                  style={{ width: `${(count / funnelBase) * 100}%` }}
                />
              </div>
            )}
            <div className="bcol-cards">
              {live && showAddBlocks && (
                <div className="bcol-add">
                  <Button variant="primary" onClick={() => onAdd(rail as Status)}>
                    {t("board.addHere")}
                  </Button>
                </div>
              )}
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
                    setDragOverRail(null);
                  }}
                  {...cardProps(a)}
                />
              ))}
              {cards.length === 0 && !live && (
                <div className="bempty">{t("empty.boardEmpty")}</div>
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
          history={history}
          onSaveOutcome={onSaveOutcome}
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
  onSaveOutcome,
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
  onSaveOutcome: (id: number, reason: string | null, note: string | null) => void;
  lastInteractions: { application_id: number; last_at: string }[];
  onOpenJob: (id: number | null) => void;
  onOpenQuickAdd: (stage?: Status) => void;
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
  // Which rails are folded (#535 shell). Kept on profile so it follows you
  // between devices; the defaults stand in until that lands, which is what
  // someone who has never folded anything would see anyway.
  // Paint from the last known answer, not from the defaults: the server copy
  // is authoritative but arrives on a request, and a board that rearranges
  // itself a second after it appears is worse than one that starts stale.
  const [folded, setFolded] = useState<Set<BoardRail>>(() => {
    const cached = readFoldCache();
    return new Set((cached ?? DEFAULT_FOLDED) as BoardRail[]);
  });
  // Set once "Closed applications" has rearranged the board: the profile
  // read resolves after it, and without this it would put the live stages
  // straight back.
  const overridden = useRef(false);
  useEffect(() => {
    let live = true;
    api
      .profile()
      .then((p) => {
        if (!live || overridden.current) return;
        // NULL means never set, so the defaults apply; the empty string
        // means someone deliberately unfolded everything.
        if (p.board_folded == null) return;
        const next = p.board_folded.split(",").filter(Boolean);
        writeFoldCache(next);
        setFolded(new Set(next as BoardRail[]));
      })
      .catch(() => {
        // A failed read leaves the defaults in place — the board is still
        // usable, and the next toggle writes a full set anyway.
      });
    return () => {
      live = false;
    };
  }, []);
  const applyFold = useCallback(
    (next: Set<BoardRail>, previous: Set<BoardRail>) => {
      overridden.current = true;
      setFolded(next);
      const ordered = BOARD_RAILS.filter((r) => next.has(r));
      writeFoldCache(ordered);
      api.setBoardFolded(ordered).catch((e) => {
        // Put the board back. A rejected save that leaves the fold on screen
        // reverts on the next load with no explanation, and the cache — whose
        // whole job is to predict what the server will say — is left holding
        // a value the server refused.
        setFolded(previous);
        writeFoldCache(BOARD_RAILS.filter((r) => previous.has(r)));
        onError((e as Error).message);
      });
    },
    [onError],
  );
  const toggleFold = (rail: BoardRail) => {
    const next = new Set(folded);
    if (!next.delete(rail)) next.add(rail);
    applyFold(next, folded);
  };

  // "Closed applications" from the menu (A) — there is no Archive screen, so
  // it folds the live stages and opens the closed ones on the board itself.
  // The toast offers the way back, because this is a view someone lands in
  // and has to be able to leave without knowing what was folded before.
  const navigate = useNavigate();
  const navState = useLocation().state as {
    showClosed?: boolean;
    showPinned?: boolean;
  } | null;
  const showClosed = navState?.showClosed;
  const [pinnedOnly, setPinnedOnly] = useState(false);
  useEffect(() => {
    if (!showClosed) return;
    const before = new Set(folded);
    applyFold(new Set<BoardRail>(PIPELINE), before);
    notify(
      t("board.showingClosed"),
      () => applyFold(before, new Set<BoardRail>(PIPELINE)),
      t("board.backToLive"),
    );
    // Consume it, or every later visit to the board reopens the closed view.
    navigate("/board", { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showClosed]);

  useEffect(() => {
    if (!navState?.showPinned) return;
    setPinnedOnly(true);
    notify(t("board.showingPinned"), () => setPinnedOnly(false), t("board.showAll"));
    navigate("/board", { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState?.showPinned]);

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
      (roleFilter === "all" || a.role_type === roleFilter) &&
      (companyFilter === "all" || String(a.company_id) === companyFilter) &&
      (tagFilter === "all" ||
        a.tags.some((tg) => String(tg.id) === tagFilter)) &&
      (!q ||
        [a.title, a.company_name, a.contact_name, a.notes, a.source]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))) &&
      (!pinnedOnly || !!a.pinned_at),
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
  return (
    <section>
      {applications.length === 0 && (
        <p className="pipeline-empty-hint">
          {t("empty.pipelineNoJobs")}{" "}
          <Button variant="link" onClick={() => onOpenQuickAdd()}>
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
        pinnedOnly={pinnedOnly}
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
        history={history}
        onSaveOutcome={onSaveOutcome}
        initialDetailId={null}
        onDetailIdChange={onOpenJob}
        folded={folded}
        onToggleFold={toggleFold}
        onAdd={onOpenQuickAdd}
        showAddBlocks={applications.length > 0}
      />


    </section>
  );
}
