import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChunkBoundary } from "./chunk-boundary";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { type Profile, type Status } from "./types";
import {
  AdminIcon,
  ArchiveIcon,
  ErrorIcon,
  NavCvIcon,
  NavInsightsIcon,
  NavFeedIcon,
  NavNetworkIcon,
  NavOverviewIcon,
  NavPipelineIcon,
  RemoveIcon,
  SettingsIcon,
} from "./icons";
import { ConfirmHost } from "./ui";
import { type Tab, TAB_PATHS, canonicalPath, parsePath } from "./routing";
import { DashboardTab } from "./dashboard";
import { InsightsTab } from "./insights";

// Tab bodies are code-split (perf review, #446): only the active tab's chunk
// loads, instead of shipping every tab in the initial bundle. Dashboard stays
// eager since it's the default landing view; a Suspense boundary in <main>
// shows the loading skeleton while a tab chunk fetches.
const SettingsPage = lazy(() =>
  import("./settings").then((m) => ({ default: m.SettingsPage })),
);
const FeedTab = lazy(() =>
  import("./feed").then((m) => ({ default: m.FeedTab })),
);
const CompaniesTab = lazy(() =>
  import("./companies").then((m) => ({ default: m.CompaniesTab })),
);
const ContactsTab = lazy(() =>
  import("./contacts").then((m) => ({ default: m.ContactsTab })),
);
const CVTab = lazy(() => import("./cv").then((m) => ({ default: m.CVTab })));
const ApplicationDetailModal = lazy(() =>
  import("./detail").then((m) => ({ default: m.ApplicationDetailModal })),
);
const PipelineTab = lazy(() =>
  import("./board").then((m) => ({ default: m.PipelineTab })),
);
const AdminPage = lazy(() =>
  import("./admin").then((m) => ({ default: m.AdminPage })),
);
import { useSession } from "./auth-client";
import {
  Button,
  CommandPalette,
  OnboardingChecklist,
  OutcomeDialog,
  PillTabs,
  QuickAddDialog,
  Skeleton,
  WordmarkMenu,
} from "./components";
import { isDead, isDue, isOverdue } from "./format";
import { useAppData, useToasts } from "./app-data";
import {
  clearChunkRetry,
  useDocumentTitle,
  useGlobalShortcuts,
  useNotificationNavigation,
  useScrolled,
  useViewportBottomOffset,
} from "./hooks";
import { BottomBar, type NavItem, ToastStack, TopBar } from "./shell";

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  // Every route into the board keeps the board's query string. The view
  // (search, sort, filters, pinned) lives there now, so a bare "/board"
  // means "and discard what they were looking at" — which is not what
  // pressing "p" or opening Closed applications is asking for. Measured:
  // "p" on a filtered board dropped the filter, and because it also blanked
  // the parameter it was toggling, pressing it twice pinned twice instead of
  // toggling back off.
  // Prefix match, not equality: closing a card navigates from "/board/123"
  // back to "/board", and that is exactly the trip that must not lose the
  // filters. Arriving from another tab carries nothing, which is right —
  // there is no view to preserve.
  const boardTarget = useCallback(
    (id?: number) => ({
      pathname: id === undefined ? "/board" : `/board/${id}`,
      search: location.pathname.startsWith("/board") ? location.search : "",
    }),
    [location.pathname, location.search],
  );
  const navigate = useNavigate();
  const { tab, id: detailIdFromUrl } = parsePath(location.pathname);
  const setTab = (next: Tab) => navigate(TAB_PATHS[next]);
  const { data: session } = useSession();
  const sessionUser = session?.user;
  const isAdmin = sessionUser?.role === "admin";
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Which stage a board add block opened the dialog for (#535). Every other
  // entry point leaves it unset and the dialog picks its own default.
  const [quickAddStage, setQuickAddStage] = useState<Status | undefined>();
  const [showPalette, setShowPalette] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [jumpQuery, setJumpQuery] = useState("");
  const [onboardingProfile, setOnboardingProfile] = useState<Profile | null>(
    null,
  );
  // Whether the user has configured the job feed (any search keyword) — an
  // onboarding step, so a new user isn't left on an empty Feed tab (#453).
  const [feedConfigured, setFeedConfigured] = useState(false);
  // Whether the user has set their own weekly goal (#483) — a momentum-seeding
  // onboarding step. The goal row auto-creates with a default, so "configured"
  // means they changed the target or set a search-start date in Settings.
  const [goalConfigured, setGoalConfigured] = useState(false);
  // False until the three probes below have answered. See showOnboarding.
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem("zenith_onboarding_dismissed") === "1",
  );

  const { toasts, notify, dismiss } = useToasts();
  const {
    applications,
    setApplications,
    statsData,
    companies,
    roleTypes,
    error,
    setError,
    loading,
    reload,
    deleteWithUndo,
    setStatus,
    outcomePrompt,
    setOutcomePrompt,
    saveOutcome,
    visibleApps,
    activeApps,
    visibleCompanies,
    visibleContacts,
  } = useAppData(notify, navigate, t);

  const scrolled = useScrolled();
  useViewportBottomOffset();
  useNotificationNavigation();
  useGlobalShortcuts({
    onTogglePalette: () => setShowPalette((v) => !v),
    onQuickAdd: () => setShowQuickAdd(true),
    // 1-based, matching the keycaps the menu prints. Out-of-range keys are
    // ignored rather than clamped: pressing 9 with six destinations should
    // do nothing, not land on the last one.
    onGoToIndex: (i) => {
      const target = navItems[i - 1];
      if (target) {
        setTab(target.to);
        setMenuOpen(false);
      }
    },
    onOpenSettings: () => {
      setTab("settings");
      setMenuOpen(false);
    },
    onToggleMenu: () => setMenuOpen((v) => !v),
    onShowClosed: () => {
      setMenuOpen(false);
      navigate(boardTarget(), { state: { showClosed: true } });
    },
    onShowPinned: () => {
      setMenuOpen(false);
      navigate(boardTarget(), { state: { showPinned: true } });
    },
  });

  // allSettled, and the flag it sets, because these three are what decide
  // whether the checklist is shown at all — and they resolve on their own
  // schedule, independent of `loading`. Gating the checklist on `loading`
  // alone left the shift in place on two runs out of three.
  useEffect(() => {
    if (onboardingDismissed) return;
    void Promise.allSettled([
      api.profile().then(setOnboardingProfile),
      api.feedConfig().then((cfg) => setFeedConfigured(cfg.keywords.length > 0)),
      api.goals().then((g) =>
        setGoalConfigured(
          g.search_started_at != null || g.weekly_app_goal !== 5,
        ),
      ),
    ]).then(() => setOnboardingChecked(true));
    // Settled, not fulfilled: a failed probe still ends the not-yet-known
    // state. Leaving it pending would hide the checklist from the new
    // account that needs it most, which is the worse of the two mistakes.
  }, [onboardingDismissed]);

  const dismissOnboarding = () => {
    localStorage.setItem("zenith_onboarding_dismissed", "1");
    setOnboardingDismissed(true);
  };

  // Guard the admin route (#457): a non-admin who lands on /admin (typed URL,
  // stale link) is sent home. Wait for the session to resolve before deciding.
  useEffect(() => {
    if (tab === "admin" && sessionUser && !isAdmin) navigate("/");
  }, [tab, sessionUser, isAdmin, navigate]);

  // Legacy URLs (/jobs/:id, /stats, …) still resolve, but the address bar is
  // rewritten to the canonical route so bookmarks, share links and push
  // notifications converge on one path per screen (#488). replace: true keeps
  // the dead path out of the back stack.
  useEffect(() => {
    const canonical = canonicalPath(location.pathname);
    if (canonical) navigate(canonical, { replace: true });
  }, [location.pathname, navigate]);

  // /board/:id renders a routed detail page (#314) instead of the old
  // pane/overlay duality — one presentation for every entry point,
  // back-button friendly.
  const routedJob =
    tab === "board" && detailIdFromUrl != null
      ? visibleApps.find((a) => a.id === detailIdFromUrl) ?? null
      : null;

  // A deep link whose application is gone. Push notifications, calendar
  // entries, emails and bookmarks all point at /board/:id, and any of them
  // can outlive the row — deleted, archived out of view, or belonging to
  // someone else. The board simply rendered instead, with the dead id still
  // in the address bar, so the tap read as "nothing happened" and a refresh
  // repeated it.
  //
  // Gated on `loading`, which is the whole difficulty: the list arrives
  // after the first render, so an ungated check announces "not found" for
  // every deep link in the moment before its data lands.
  const missingJob =
    tab === "board" && detailIdFromUrl != null && !loading && !routedJob;
  // The app mounted, so whatever chunk failure prompted a reload is behind
  // us. Clearing the marker returns the one-shot reload to the next deploy
  // rather than spending it for the rest of the session.
  useEffect(() => {
    clearChunkRetry();
  }, []);

  useEffect(() => {
    if (!missingJob) return;
    notify(t("board.applicationGone"));
    // Canonicalize, or the dead id survives a refresh and the toast fires
    // again on every visit. replace, so Back does not return to it.
    navigate("/board", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingJob]);

  // Primary destinations, rendered from one list into both the desktop rail
  // (.side) and the sub-900px .tabs bar so the two never drift. Settings is
  // pinned separately (rail foot / last tab). `data` drives the mobile
  // scroll-into-view probe (tabsRef).
  const navItems: NavItem[] = [
    { data: "overview", to: "overview", active: tab === "overview", icon: <NavOverviewIcon />, label: t("tabs.overview") },
    { data: "pipeline", to: "board", active: tab === "board", icon: <NavPipelineIcon />, label: t("tabs.pipeline") },
    { data: "feed", to: "feed", active: tab === "feed", icon: <NavFeedIcon />, label: t("tabs.feed") },
    // Named for what it holds rather than for the abstraction: the shell spec
    // lists this destination as "People & companies", and the menu row and the
    // page title both read this label.
    { data: "network", to: "companies", active: tab === "companies" || tab === "contacts", icon: <NavNetworkIcon />, label: t("tabs.network") },
    { data: "cv", to: "cv", active: tab === "cv", icon: <NavCvIcon />, label: t("tabs.cv") },
    { data: "insights", to: "insights", active: tab === "insights", icon: <NavInsightsIcon />, label: t("tabs.insights") },
    // Admin-only destination (#457) — the dedicated admin area, appended so it
    // shows in the rail and mobile tabs only for admins.
    ...(isAdmin
      ? [{ data: "admin" as const, to: "admin" as const, active: tab === "admin", icon: <AdminIcon />, label: t("admin.navLabel") }]
      : []),
  ];
  // Returning from an application should put the keyboard back on the card
  // it came from. Tracked here because the board unmounts entirely while an
  // application is routed, so it cannot remember this for itself.
  const [returnFocusId, setReturnFocusId] = useState<number | null>(null);
  const lastDetailId = useRef<number | null>(null);
  useEffect(() => {
    if (detailIdFromUrl != null) {
      lastDetailId.current = detailIdFromUrl;
    } else if (lastDetailId.current != null) {
      setReturnFocusId(lastDetailId.current);
      lastDetailId.current = null;
    }
  }, [detailIdFromUrl]);

  // Named by the nav rather than by a table of its own, so a destination
  // cannot be renamed in one place and keep its old name in the other. The
  // routed job takes its own title: a bookmark or a history entry for one
  // application is the case where a generic "Pipeline" helps least.
  useDocumentTitle(
    routedJob
      ? routedJob.title
      : tab === "settings"
        ? t("settings.title")
        : navItems.find((n) => n.active)?.label ?? null,
  );

  // The menu's three tiles carry a live count (shell spec: "icon, label, live
  // count and shortcut"). Each is the number that destination's own screen
  // leads with, so the menu cannot quietly disagree with the page behind it:
  // Today's is the dashboard's "N things need you today", Pipeline's is the
  // open applications the board shows. Feed has none — its matches are loaded
  // by the Feed screen itself, and fetching them here would cost every user a
  // request on every load to put a number on a tile.
  const liveApps = useMemo(
    () => visibleApps.filter((a) => !isDead(a.status)),
    [visibleApps],
  );
  const pinnedCount = visibleApps.filter((a) => a.pinned_at).length;

  const tileCounts: Partial<Record<NavItem["data"], number>> = {
    overview: liveApps.filter((a) => isOverdue(a) || isDue(a)).length,
    pipeline: liveApps.length,
  };

  const pageTitle =
    tab === "settings"
      ? t("settings.title")
      : (navItems.find((n) => n.active)?.label ?? t("tabs.overview"));
  const onboardingComplete =
    !!(onboardingProfile?.name && onboardingProfile?.email) &&
    companies.length > 0 &&
    applications.length > 0 &&
    feedConfigured;
  // Withheld until the data is in. Every input to onboardingComplete —
  // companies, applications, the profile, the feed — starts empty, so on
  // first paint an established account is indistinguishable from a new one
  // and the checklist renders for everybody. It then disappears when the
  // real counts arrive, taking 188px out from above the Today list and
  // dropping everything below it: a reproducible 0.207 layout shift on the
  // landing screen at 390, and a quarter-second of telling a long-standing
  // user they have not set up yet.
  //
  // A genuinely new account sees it a beat later instead of instantly,
  // which is the honest trade: before the data lands, nobody knows.
  const showOnboarding =
    onboardingChecked && !loading && !onboardingDismissed && !onboardingComplete;
  const onboardingProps = {
    profileDone: !!(onboardingProfile?.name && onboardingProfile?.email),
    companyDone: companies.length > 0,
    jobDone: applications.length > 0,
    feedDone: feedConfigured,
    goalDone: goalConfigured,
    onGoToProfile: () => setTab("cv"),
    onGoToCompanies: () => setTab("companies"),
    onAddJob: () => setShowQuickAdd(true),
    onGoToFeed: () => navigate("/settings?s=feed"),
    onSetGoal: () => navigate("/settings"),
    onDismiss: dismissOnboarding,
    onLoadSample: () => navigate("/settings?s=data"),
  };

  return (
    /* The active tab, on the shell, from the first paint. The per-view width
       rules key off :has() against content that only exists once the view has
       rendered and its data has arrived — so the feed laid out at 760px
       during the fetch and jumped to 1100px when the items landed, on every
       visit. The route is known before any of that. */
    // `app-detail` comes from the URL, not from the loaded row: /board/:id
    // is known at first paint, whereas routedJob resolves only once the
    // applications arrive. The whole point of these classes is that they are
    // there before the content is.
    <div
      className={`app app-tab-${tab}${
        tab === "board" && detailIdFromUrl != null ? " app-detail" : ""
      }`}
    >
      {showQuickAdd && (
        <QuickAddDialog
          companies={visibleCompanies}
          initialStatus={quickAddStage}
          onClose={() => setShowQuickAdd(false)}
          onError={setError}
          onCreated={(a, open) => {
            setShowQuickAdd(false);
            notify(t("common.saved"));
            // Navigate on the optimistic append instead of blocking on the
            // five-endpoint reload — the page fills in as data lands.
            setApplications((prev) => [...prev, a]);
            if (open) navigate(boardTarget(a.id));
            void reload();
          }}
        />
      )}
      {outcomePrompt && (
        <OutcomeDialog
          status={outcomePrompt.status}
          onClose={() => setOutcomePrompt(null)}
          onSave={(reason, note) => {
            void saveOutcome(outcomePrompt.id, reason, note);
            setOutcomePrompt(null);
          }}
        />
      )}
      {showPalette && (
        <CommandPalette
          applications={activeApps}
          companies={visibleCompanies}
          contacts={visibleContacts}
          onClose={() => setShowPalette(false)}
          onJumpToApplication={(id) => {
            navigate(boardTarget(id));
            setShowPalette(false);
          }}
          onJumpToCompany={(id) => {
            navigate(`/companies/${id}`);
            setShowPalette(false);
          }}
          onJumpToContact={(id) => {
            navigate(`/people/${id}`);
            setShowPalette(false);
          }}
          actions={[
            {
              id: "add-job",
              label: t("palette.addJob"),
              run: () => {
                setShowPalette(false);
                setShowQuickAdd(true);
              },
            },
            {
              id: "go-feed",
              label: t("palette.goFeed"),
              run: () => {
                setShowPalette(false);
                navigate("/feed");
              },
            },
            {
              id: "go-cv",
              label: t("palette.goCv"),
              run: () => {
                setShowPalette(false);
                navigate("/cv");
              },
            },
            {
              id: "settings",
              label: t("palette.goSettings"),
              run: () => {
                setShowPalette(false);
                navigate("/settings");
              },
            },
          ]}
        />
      )}
      {menuOpen && (
        <WordmarkMenu
          destinations={navItems.map((n, i) => ({
            id: n.data,
            label: n.label,
            shortcut: String(i + 1),
            icon: n.icon,
            active: n.active,
            count: tileCounts[n.data],
          }))}
          actions={[
            {
              id: "settings",
              label: t("settings.title"),
              // The keycaps print what the app actually answers to, not what
              // the spec proposed: quick-add has been "n" since #285 and is
              // documented in the shortcuts help, so the menu says "n".
              shortcut: ",",
              icon: <SettingsIcon />,
              active: tab === "settings",
            },
            {
              id: "quick-add",
              // Not toolbar.addJob: that copy carries its own "+" for the
              // board's button, and this row already draws one as its icon —
              // the menu read "+ + Add job".
              label: t("menu.addJob"),
              shortcut: "n",
              icon: <span aria-hidden="true">+</span>,
              active: false,
            },
            {
              // There is no Archive screen (#535): a closed application is
              // still in the pipeline, it has just stopped moving. This opens
              // the closed stages on the board instead of a separate list.
              id: "closed",
              label: t("menu.closedApplications"),
              // Not "a": the feed has answered to that since #144 and it is
              // documented on the feed's own help line. A global fallback
              // that steals a screen's key is worse than an unmemorable one.
              shortcut: "c",
              icon: <ArchiveIcon />,
              active: false,
            },
          ]}
          onSelect={(id) => {
            setMenuOpen(false);
            if (id === "settings") return setTab("settings");
            if (id === "quick-add") return setShowQuickAdd(true);
            if (id === "closed")
              return navigate(boardTarget(), { state: { showClosed: true } });
            const target = navItems.find((n) => n.data === id);
            if (target) setTab(target.to);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <div className="main">
        <TopBar
          scrolled={scrolled}
          pageTitle={pageTitle}
          settingsActive={tab === "settings"}
          onOpenSettings={() => setTab("settings")}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenBoard={() => setTab("board")}
        />

      {/* The region is always mounted; only the banner inside it comes and
          goes. A role="alert" element that appears with its text already in
          place is announced inconsistently across screen readers — the
          reliable contract is a live region that is present first and
          changes afterwards. Before this the failure was visible and
          silent: the banner rendered, and nothing told anyone not looking
          at that corner of the page that their change had not been saved.

          The wrapper carries no styling, so the banner keeps its own box
          and the layout is unchanged — .error is styled by class, not by
          position. */}
      <div role="alert" aria-live="assertive">
        {error && (
          <p className="error">
            <ErrorIcon />
            <span className="error-text">{error}</span>
            <button
              type="button"
              className="error-dismiss"
              onClick={() => setError(null)}
              aria-label={t("common.close")}
            >
              <RemoveIcon />
            </button>
          </p>
        )}
      </div>

      <main className="content">
        {loading ? (
          <Skeleton />
        ) : (
          <ChunkBoundary>
          <Suspense fallback={<Skeleton />}>
            {tab === "overview" && showOnboarding && (
              <OnboardingChecklist {...onboardingProps} />
            )}
            {tab === "overview" && (
              <DashboardTab
                applications={visibleApps}
                onOpenJob={(id) => navigate(boardTarget(id))}
                onGoToJobs={() => setTab("board")}
                onError={setError}
                onChanged={reload}
                stats={statsData}
                notify={notify}
                onOpenQuickAdd={() => setShowQuickAdd(true)}
              />
            )}
            {tab === "insights" && (
              <InsightsTab
                applications={visibleApps}
                onGoToJobs={() => setTab("board")}
                onOpenJob={(id) => navigate(boardTarget(id))}
                // Same target the "c" shortcut and the menu use: the closed
                // rails are folded by default, so landing on a bare board
                // would show none of what the link promised.
                onShowClosed={() =>
                  navigate(boardTarget(), { state: { showClosed: true } })
                }
                onError={setError}
                onJump={(title) => {
                  setJumpQuery(title);
                  setTab("board");
                }}
                stats={statsData}
              />
            )}
            {routedJob && (
              <section className="job-page">
                <Button
                  variant="secondary"
                  className="job-back"
                  onClick={() => {
                    // Return to wherever the user came from — dashboard, feed,
                    // board — not always the pipeline (#448). location.key is
                    // "default" only on a direct deep-link with no in-app
                    // history; fall back to the board there.
                    if (location.key !== "default") navigate(-1);
                    else navigate(boardTarget());
                  }}
                >
                  ← {t("common.back")}
                </Button>
                <ApplicationDetailModal
                  key={routedJob.id}
                  application={routedJob}
                  allApplications={visibleApps}
                  companies={visibleCompanies}
                  contacts={visibleContacts}
                  roleTypes={roleTypes}
                  onClose={() => navigate(boardTarget())}
                  onChanged={reload}
                  onError={setError}
                  notify={notify}
                  onDelete={deleteWithUndo}
                  onStatus={setStatus}
                  history={statsData?.history ?? []}
                  onSaveOutcome={saveOutcome}
                />
              </section>
            )}
            {tab === "board" && !routedJob && (
              <PipelineTab
                applications={visibleApps}
                companies={visibleCompanies}
                roleTypes={roleTypes}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onStatus={setStatus}
                initialQuery={jumpQuery}
                onQueryConsumed={() => setJumpQuery("")}
                history={statsData?.history ?? []}
                lastInteractions={statsData?.interactions ?? []}
                onOpenJob={(id: number | null) =>
                  navigate(boardTarget(id ?? undefined))
                }
                focusCardId={returnFocusId}
                onFocusRestored={() => setReturnFocusId(null)}
                onOpenQuickAdd={(stage) => {
                  setQuickAddStage(stage);
                  setShowQuickAdd(true);
                }}
                onOpenSampleData={() => navigate("/settings?s=data")}
              />
            )}
            {tab === "feed" && (
              <FeedTab
                onError={setError}
                notify={notify}
                roleTypes={roleTypes}
                onOpenSettings={() => navigate("/settings?s=feed")}
                onGoToCv={() => navigate("/cv")}
                onChanged={reload}
                onOpenJob={(id) => navigate(boardTarget(id))}
              />
            )}
            {(tab === "companies" || tab === "contacts") && (
              <PillTabs<"companies" | "contacts">
                tabs={[
                  { key: "companies", label: t("tabs.companies") },
                  { key: "contacts", label: t("tabs.people") },
                ]}
                active={tab}
                onSelect={setTab}
                aria-label={t("tabs.network")}
              />
            )}
            {tab === "companies" && (
              <CompaniesTab
                companies={visibleCompanies}
                applications={visibleApps}
                contacts={visibleContacts}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                initialQuery={jumpQuery}
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/companies/${id}` : "/companies")
                }
              />
            )}
            {tab === "contacts" && (
              <ContactsTab
                contacts={visibleContacts}
                companies={visibleCompanies}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                initialQuery={jumpQuery}
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/people/${id}` : "/people")
                }
              />
            )}
            {tab === "cv" && <CVTab onError={setError} notify={notify} />}
            {tab === "admin" && isAdmin && <AdminPage onError={setError} />}
            {tab === "settings" && (
              <SettingsPage
                roleTypes={roleTypes}
                onRoleTypesChanged={reload}
                notify={notify}
              />
            )}
          </Suspense>
          </ChunkBoundary>
        )}
      </main>
      </div>

      <BottomBar
        onSearch={() => setShowPalette(true)}
        onPinned={() => navigate(boardTarget(), { state: { showPinned: true } })}
        pinnedCount={pinnedCount}
      />
      <ConfirmHost />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
