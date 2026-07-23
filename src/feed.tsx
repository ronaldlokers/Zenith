// Feed feature extracted from App.tsx (#285 split) — the ATS/job-board
// feed tab, its swipe-triage cards, and the feed-sources settings section.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { LoadFailed, LoadingSkeleton } from "./ui";
import { requestConfirm } from "./hooks";
import { EmptyFeedIcon, RemoveIcon } from "./icons";
import { safeHref, formatDate } from "./format";
import type {
  AtsBoard,
  FeedCursor,
  FeedItem,
  RoleTypeDef,
} from "./types";
import { sortFilterFeed } from "./skill-match";
import { Button, Chip, EmptyState, SegmentedControl, Toolbar } from "./components";

export function FeedSettings({
  roleTypes,
  onRoleTypesChanged,
  onError,
  notify,
}: {
  roleTypes: RoleTypeDef[];
  onRoleTypesChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<{
    sources: { source: string; enabled: number; location: string | null }[];
    keywords: { id: number; role_slug: string; keyword: string }[];
  } | null>(null);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newKeyword, setNewKeyword] = useState<Record<string, string>>({});
  const [blocklist, setBlocklist] = useState<
    { id: number; company: string }[] | null
  >(null);
  const [newBlockedCompany, setNewBlockedCompany] = useState("");
  const [atsBoards, setAtsBoards] = useState<AtsBoard[] | null>(null);
  const [newBoardSource, setNewBoardSource] = useState<"greenhouse" | "ashby">(
    "greenhouse",
  );
  const [newBoardSlug, setNewBoardSlug] = useState("");

  const [failed, setFailed] = useState(false);
  const loadConfig = useCallback(
    () =>
      api
        .feedConfig()
        .then((c) => {
          setFailed(false);
          setConfig(c);
        })
        .catch((e) => {
          setFailed(true);
          onError((e as Error).message);
        }),
    [onError],
  );

  const loadBlocklist = useCallback(
    () =>
      api
        .feedBlocklist()
        .then(setBlocklist)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  const loadAtsBoards = useCallback(
    () =>
      api
        .atsBoards()
        .then(setAtsBoards)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    loadConfig();
    loadBlocklist();
    loadAtsBoards();
  }, [loadConfig, loadBlocklist, loadAtsBoards]);

  const addBlockedCompany = (e: FormEvent) => {
    e.preventDefault();
    const company = newBlockedCompany.trim();
    if (!company) return;
    api
      .blockFeedCompany(company)
      .then(() => {
        setNewBlockedCompany("");
        return loadBlocklist();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeBlockedCompany = (id: number) => {
    api
      .unblockFeedCompany(id)
      .then(loadBlocklist)
      .catch((e) => onError((e as Error).message));
  };

  const addAtsBoard = (e: FormEvent) => {
    e.preventDefault();
    const slug = newBoardSlug.trim();
    if (!slug) return;
    api
      .addAtsBoard(newBoardSource, slug)
      .then(() => {
        setNewBoardSlug("");
        return loadAtsBoards();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeAtsBoard = (id: number) => {
    api
      .removeAtsBoard(id)
      .then(loadAtsBoards)
      .catch((e) => onError((e as Error).message));
  };

  const addRole = (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleLabel.trim()) return;
    api
      .createRoleType(newRoleLabel.trim())
      .then(() => {
        setNewRoleLabel("");
        notify(t("toast.roleTypeAdded"));
        return onRoleTypesChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const renameRole = (r: RoleTypeDef, label: string) => {
    if (!label.trim() || label === r.label) return;
    api
      .updateRoleType(r.id, { label: label.trim() })
      .then(onRoleTypesChanged)
      .catch((e) => onError((e as Error).message));
  };

  const removeRole = async (r: RoleTypeDef) => {
    if (
      !(await requestConfirm(t("confirm.deleteRoleType", { label: r.label })))
    )
      return;
    api
      .deleteRoleType(r.id)
      .then(() => {
        notify(t("toast.deleted", { name: r.label }));
        return Promise.all([onRoleTypesChanged(), loadConfig()]);
      })
      .catch((e) => onError((e as Error).message));
  };

  const saveSource = (
    source: string,
    enabled: boolean,
    location: string | null,
  ) => {
    api
      .updateFeedSource(source, { enabled, location })
      .then(() => {
        notify(t("toast.savedSettings", { source }));
        return loadConfig();
      })
      .catch((e) => onError((e as Error).message));
  };

  const addKeyword = (roleSlug: string) => {
    const kw = (newKeyword[roleSlug] ?? "").trim();
    if (!kw) return;
    api
      .addFeedKeyword(roleSlug, kw)
      .then(() => {
        setNewKeyword((m) => ({ ...m, [roleSlug]: "" }));
        return loadConfig();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeKeyword = (id: number) => {
    api
      .deleteFeedKeyword(id)
      .then(loadConfig)
      .catch((e) => onError((e as Error).message));
  };

  if (failed && !config) return <LoadFailed onRetry={loadConfig} />;
  if (!config) return <p className="muted small">{t("common.loading")}</p>;

  return (
    <div className="feed-settings">
      <h3 className="detail-sub">{t("feedSettings.roleTypes")}</h3>
      <ul className="settings-list">
        {roleTypes.map((r) => (
          <li key={r.id}>
            <input
              defaultValue={r.label}
              onBlur={(e) => renameRole(r, e.target.value)}
            />
            <button className="danger" onClick={() => removeRole(r)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addRole}>
        <input
          placeholder={t("feedSettings.newRoleType")}
          value={newRoleLabel}
          onChange={(e) => setNewRoleLabel(e.target.value)}
        />
        <Button type="submit" variant="primary">
          {t("feedSettings.add")}
        </Button>
      </form>

      <h3 className="detail-sub">{t("feedSettings.sources")}</h3>
      <ul className="settings-list">
        {config.sources.map((s) => (
          <li key={s.source} className="source-row">
            <label className="checkbox">
              <input
                type="checkbox"
                defaultChecked={!!s.enabled}
                onChange={(e) =>
                  saveSource(s.source, e.target.checked, s.location)
                }
              />
              {s.source}
            </label>
            <input
              placeholder={
                s.source === "adzuna"
                  ? t("feedSettings.countryCode")
                  : t("feedSettings.locationFilter")
              }
              defaultValue={s.location ?? ""}
              onBlur={(e) =>
                saveSource(s.source, !!s.enabled, e.target.value || null)
              }
            />
          </li>
        ))}
      </ul>

      <h3 className="detail-sub">{t("feedSettings.searchKeywords")}</h3>
      {roleTypes.map((r) => {
        const kws = config.keywords.filter((k) => k.role_slug === r.slug);
        return (
          <div key={r.id} className="keyword-group">
            <span className="muted small">{r.label}</span>
            <div className="keyword-chips">
              {kws.map((k) => (
                <Chip key={k.id}>
                  {k.keyword}
                  <button
                    onClick={() => removeKeyword(k.id)}
                    aria-label={t("feedSettings.removeKeyword")}
                  >
                    <RemoveIcon />
                  </button>
                </Chip>
              ))}
              <input
                placeholder={t("feedSettings.keywordPlaceholder")}
                value={newKeyword[r.slug] ?? ""}
                onChange={(e) =>
                  setNewKeyword((m) => ({ ...m, [r.slug]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword(r.slug);
                  }
                }}
              />
            </div>
          </div>
        );
      })}

      <h3 className="detail-sub">{t("feedSettings.blocklist")}</h3>
      <div className="keyword-chips">
        {(blocklist ?? []).map((b) => (
          <Chip key={b.id}>
            {b.company}
            <button
              onClick={() => removeBlockedCompany(b.id)}
              aria-label={t("feedSettings.removeKeyword")}
            >
              <RemoveIcon />
            </button>
          </Chip>
        ))}
        <form onSubmit={addBlockedCompany}>
          <input
            placeholder={t("feedSettings.blocklistPlaceholder")}
            value={newBlockedCompany}
            onChange={(e) => setNewBlockedCompany(e.target.value)}
          />
        </form>
      </div>

      <h3 className="detail-sub">{t("feedSettings.atsBoards")}</h3>
      <p className="muted small">{t("feedSettings.atsBoardsHint")}</p>
      <ul className="settings-list">
        {(atsBoards ?? []).map((b) => (
          <li key={b.id}>
            <span>
              {b.source === "greenhouse" ? "Greenhouse" : "Ashby"}: {b.slug}
            </span>
            <button className="danger" onClick={() => removeAtsBoard(b.id)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addAtsBoard}>
        <select
          value={newBoardSource}
          onChange={(e) => setNewBoardSource(e.target.value as "greenhouse" | "ashby")}
        >
          <option value="greenhouse">Greenhouse</option>
          <option value="ashby">Ashby</option>
        </select>
        <input
          placeholder={t("feedSettings.atsBoardSlugPlaceholder")}
          value={newBoardSlug}
          onChange={(e) => setNewBoardSlug(e.target.value)}
        />
        <Button type="submit" variant="primary">
          {t("feedSettings.add")}
        </Button>
      </form>
    </div>
  );
}

export function FeedTab({
  onError,
  notify,
  roleTypes,
  onOpenSettings,
  onChanged,
  onOpenJob,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void, label?: string) => void;
  roleTypes: RoleTypeDef[];
  onOpenSettings: () => void;
  onChanged: () => Promise<void>;
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  // Surface high-fit jobs: sort the flat chronological feed by CV skill match
  // and optionally hide anything below a minimum. The match count is computed
  // server-side now (#446) and arrives on each item as match_count.
  const [sortBy, setSortBy] = useState<"newest" | "match">("newest");
  const [minFit, setMinFit] = useState(0);
  const visibleItems = useMemo(
    () =>
      sortFilterFeed(
        items ?? [],
        (i) => i.match_count ?? 0,
        sortBy,
        minFit,
      ),
    [items, sortBy, minFit],
  );

  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardsRef = useRef<HTMLUListElement>(null);
  const kbNav = useRef(false);
  // Move real DOM focus to the j/k-selected card (#285) so the selection is
  // perceivable to screen-reader and keyboard users, not just a CSS class.
  // Only on actual keyboard nav — not the initial mount or a list refresh,
  // which would otherwise steal focus to the first card.
  useEffect(() => {
    if (!kbNav.current) return;
    kbNav.current = false;
    const cards = cardsRef.current?.querySelectorAll<HTMLElement>(".feed-card");
    cards?.[focusedIndex]?.focus();
  }, [focusedIndex]);

  const load = useCallback(
    () => {
      setFailed(false);
      return api
        .feed()
        .then((page) => {
          setItems(page.items);
          setCursor(page.nextCursor);
        })
        .catch((e) => {
          setFailed(true);
          onError((e as Error).message);
        });
    },
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    api
      .feed(cursor)
      .then((page) => {
        setItems((prev) => [...(prev ?? []), ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setLoadingMore(false));
  };

  const refresh = () => {
    setRefreshing(true);
    api
      .refreshFeed()
      .then((r) => {
        notify(t("toast.feedFound", { inserted: r.inserted, seen: r.seen }));
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setRefreshing(false));
  };

  const dismiss = (item: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    api.dismissFeedItem(item.id).catch((e) => {
      // Optimistic removal must roll back (#346) — otherwise the card
      // vanishes client-side while still active server-side.
      setItems((prev) => (prev ? [item, ...prev] : [item]));
      onError((e as Error).message);
    });
  };

  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const addToPipeline = (item: FeedItem) => {
    if (addingIds.has(item.id)) return;
    setAddingIds((s) => new Set(s).add(item.id));
    api
      .addFeedItem(item.id)
      .then((created) => {
        setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
        void onChanged();
        notify(
          t("toast.addedToJobs", { title: item.title }),
          () => onOpenJob(created.id),
          t("toast.open"),
        );
      })
      .catch((e) => onError((e as Error).message))
      .finally(() =>
        setAddingIds((s) => {
          const next = new Set(s);
          next.delete(item.id);
          return next;
        }),
      );
  };

  // Keep focus in range after add/dismiss (#261) or a sort/filter change
  // shrinks the visible list — otherwise j/k could point past the end.
  useEffect(() => {
    setFocusedIndex((i) =>
      Math.min(i, Math.max(0, visibleItems.length - 1)),
    );
  }, [visibleItems]);

  // Desktop keyboard triage (#144) — mirrors the Jobs tab's j/k pattern
  // (#39): j/k move focus, a adds the focused item, d dismisses it. The
  // swipe gesture from the same issue is mobile-only (a mouse-drag
  // simulation of a touch gesture reads as gimmicky, not efficient); both
  // input methods keep the existing buttons as the accessible fallback.
  // Latest triage state for the global key handler. The list, focus, and the
  // add/dismiss closures all change on nearly every render; keeping them in a
  // ref lets the keydown listener subscribe once instead of tearing down and
  // re-adding on every focus move or item change, while still acting on
  // current values.
  const triageRef = useRef({
    items: visibleItems,
    focusedIndex,
    addToPipeline,
    dismiss,
  });
  useEffect(() => {
    triageRef.current = {
      items: visibleItems,
      focusedIndex,
      addToPipeline,
      dismiss,
    };
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const { items, focusedIndex, addToPipeline, dismiss } = triageRef.current;
      const list = items ?? [];
      if (e.key === "j") {
        e.preventDefault();
        kbNav.current = true;
        setFocusedIndex((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        kbNav.current = true;
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "a") {
        const target = list[focusedIndex];
        if (target) {
          e.preventDefault();
          addToPipeline(target);
        }
      } else if (e.key === "d") {
        const target = list[focusedIndex];
        if (target) {
          e.preventDefault();
          dismiss(target);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // The desktop triage pane mirrors the keyboard/click-selected list row.
  const focusedItem = visibleItems[focusedIndex] ?? null;
  const focusedRole = focusedItem
    ? (roleTypes.find((r) => r.slug === focusedItem.role_type)?.label ??
      focusedItem.role_type)
    : "";

  return (
    <section>
      <Toolbar>
        <p className="muted small" style={{ margin: 0 }}>
          {t("feed.pulledFrom")}
        </p>
        <button className="btn-secondary" onClick={onOpenSettings}>
          {t("feed.settings")}
        </button>
        <Button variant="primary" disabled={refreshing} onClick={refresh}>
          {refreshing ? t("feed.checking") : t("feed.checkNow")}
        </Button>
      </Toolbar>

      {failed && !items && <LoadFailed onRetry={load} />}
      {!failed && !items && <LoadingSkeleton />}

      {items && items.length > 0 && (
        <div className="feed-controls">
          <span className="feed-controls-label muted small">
            {t("feed.sortLabel")}
          </span>
          <SegmentedControl role="group" aria-label={t("feed.sortLabel")}>
            <button
              className={sortBy === "newest" ? "active" : ""}
              onClick={() => setSortBy("newest")}
            >
              {t("feed.sortNewest")}
            </button>
            <button
              className={sortBy === "match" ? "active" : ""}
              onClick={() => setSortBy("match")}
            >
              {t("feed.sortMatch")}
            </button>
          </SegmentedControl>
          <span className="feed-controls-label muted small">
            {t("feed.fitLabel")}
          </span>
          <SegmentedControl role="group" aria-label={t("feed.fitLabel")}>
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                className={minFit === n ? "active" : ""}
                onClick={() => setMinFit(n)}
              >
                {n === 0 ? t("feed.fitAny") : `${n}+`}
              </button>
            ))}
          </SegmentedControl>
        </div>
      )}

      {items && items.length > 0 && visibleItems.length === 0 && (
        <p className="muted small feed-nomatch">{t("feed.noFitMatch")}</p>
      )}

      {visibleItems.length > 0 && (
        <div className="feed-triage">
          <ul className="cards feed-list" ref={cardsRef}>
            {visibleItems.map((item, i) => (
              <FeedCard
                key={item.id}
                item={item}
                roleLabel={
                  roleTypes.find((r) => r.slug === item.role_type)?.label ??
                  item.role_type
                }
                matched={item.match_count ?? null}
                focused={i === focusedIndex}
                adding={addingIds.has(item.id)}
                onAdd={() => addToPipeline(item)}
                onDismiss={() => dismiss(item)}
                onSelect={() => {
                  kbNav.current = false;
                  setFocusedIndex(i);
                }}
              />
            ))}
          </ul>
          {focusedItem && (
            <aside className="feed-detail" aria-live="polite">
              <span className="feed-detail-src">
                {t("feed.viaSource", { source: focusedItem.source })}
                {focusedItem.posted_at
                  ? ` · ${formatDate(focusedItem.posted_at)}`
                  : ""}
              </span>
              <h3>{focusedItem.title}</h3>
              <p className="feed-detail-co muted">
                {[focusedItem.company, focusedItem.location]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p className="muted small">
                {focusedRole}
                {focusedItem.salary_text ? ` · ${focusedItem.salary_text}` : ""}
              </p>
              {safeHref(focusedItem.url) && (
                <a
                  href={safeHref(focusedItem.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="small"
                >
                  {t("feed.viewPosting")}
                </a>
              )}
              <div className="feed-detail-actions">
                <Button
                  variant="primary"
                  onClick={() => addToPipeline(focusedItem)}
                  disabled={addingIds.has(focusedItem.id)}
                >
                  {t("feed.addToJobs")}
                </Button>
                <button
                  className="btn-secondary"
                  onClick={() => dismiss(focusedItem)}
                >
                  {t("feed.dismiss")}
                </button>
              </div>
              <p className="feed-detail-hint">{t("feed.triageHint")}</p>
            </aside>
          )}
        </div>
      )}
      {items?.length === 0 && (
        <ul className="cards">
          <EmptyState as="li">
            <EmptyFeedIcon />
            {t("empty.feedNothingNew")}
          </EmptyState>
        </ul>
      )}
      {cursor && (
        <div className="load-more">
          <button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t("common.loading") : t("common.loadMore")}
          </button>
        </div>
      )}
    </section>
  );
}

// Mobile swipe-to-triage (#144) — swipe right to add, left to dismiss.
// Desktop keeps the buttons plus j/k/a/d (see FeedTab); a mouse-drag
// simulation of the same gesture was rejected as gimmicky for a pointer
// device, so this only activates via touch.
const SWIPE_COMMIT_THRESHOLD = 90;

function FeedCard({
  item,
  roleLabel,
  focused,
  adding,
  onAdd,
  onDismiss,
  onSelect,
  matched,
}: {
  item: FeedItem;
  roleLabel: string;
  focused: boolean;
  adding: boolean;
  onAdd: () => void;
  onDismiss: () => void;
  onSelect: () => void;
  matched: number | null;
}) {
  const { t } = useTranslation();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    setDragX(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragX > SWIPE_COMMIT_THRESHOLD) onAdd();
    else if (dragX < -SWIPE_COMMIT_THRESHOLD) onDismiss();
    setDragX(0);
  };

  // One row for both layouts: on the desktop two-pane the row is compact
  // (title + company; meta/link/actions live in the detail pane), and below
  // 900px it expands to the full card with inline actions + swipe.
  return (
    <li
      className={`feed-card feed-row${focused ? " kb-focused sel" : ""}${dragX > 0 ? " swipe-add" : dragX < 0 ? " swipe-dismiss" : ""}`}
      tabIndex={focused ? 0 : -1}
      aria-current={focused ? "true" : undefined}
      onClick={onSelect}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={dragging ? { transform: `translateX(${dragX}px)` } : undefined}
    >
      <div className="feed-row-main">
        <strong>{item.title}</strong>
        <span className="muted small">
          {[item.company, item.location].filter(Boolean).join(" · ")}
        </span>
        <span className="muted small feed-row-meta">
          {roleLabel}
          {item.salary_text ? ` · ${item.salary_text}` : ""}
          {" · "}
          {t("feed.viaSource", { source: item.source })}
        </span>
        {matched != null && matched > 0 && (
          <span className="feed-match" title={t("feed.skillsMatchHint")}>
            {t("feed.skillsMatch", { count: matched })}
          </span>
        )}
        {safeHref(item.url) && (
          <a
            href={safeHref(item.url)}
            target="_blank"
            rel="noreferrer"
            className="small feed-row-link"
            onClick={(e) => e.stopPropagation()}
          >
            {t("feed.viewPosting")}
          </a>
        )}
      </div>
      <div className="feed-row-actions">
        <Button
          variant="primary"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={adding}
        >
          {t("feed.addToJobs")}
        </Button>
        <button
          className="btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          {t("feed.dismiss")}
        </button>
      </div>
    </li>
  );
}
