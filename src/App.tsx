import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { type Profile } from "./types";
import {
  ErrorIcon,
  NavCalendarIcon,
  NavCvIcon,
  NavFeedIcon,
  NavNetworkIcon,
  NavOverviewIcon,
  NavPipelineIcon,
  RemoveIcon,
} from "./icons";
import { ConfirmHost, LoadingSkeleton } from "./ui";
import { type Tab, TAB_PATHS, parsePath } from "./routing";
import { DashboardTab } from "./dashboard";

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
  import("./network").then((m) => ({ default: m.CompaniesTab })),
);
const ContactsTab = lazy(() =>
  import("./network").then((m) => ({ default: m.ContactsTab })),
);
const CVTab = lazy(() => import("./cv").then((m) => ({ default: m.CVTab })));
const CalendarTab = lazy(() =>
  import("./calendar").then((m) => ({ default: m.CalendarTab })),
);
const ApplicationDetailModal = lazy(() =>
  import("./detail").then((m) => ({ default: m.ApplicationDetailModal })),
);
const PipelineTab = lazy(() =>
  import("./board").then((m) => ({ default: m.PipelineTab })),
);
import { useSession } from "./auth-client";
import { CommandPalette, OnboardingChecklist, QuickAddDialog } from "./components";
import { useAppData, useToasts } from "./app-data";
import {
  useGlobalShortcuts,
  useNotificationNavigation,
  useScrollActiveTabIntoView,
  useScrolled,
  useViewportBottomOffset,
} from "./hooks";
import { MobileTabs, type NavItem, Sidebar, ToastStack, TopBar } from "./shell";

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab, id: detailIdFromUrl } = parsePath(location.pathname);
  const setTab = (next: Tab) => navigate(TAB_PATHS[next]);
  const { data: session } = useSession();
  const sessionUser = session?.user;
  const userInitials = sessionUser?.name
    ? sessionUser.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : (sessionUser?.email?.[0]?.toUpperCase() ?? "?");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [jumpQuery, setJumpQuery] = useState("");
  const [onboardingProfile, setOnboardingProfile] = useState<Profile | null>(
    null,
  );
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
    visibleApps,
    activeApps,
    visibleCompanies,
    visibleContacts,
  } = useAppData(notify, navigate, t);

  const scrolled = useScrolled();
  const tabsRef = useScrollActiveTabIntoView(tab);
  useViewportBottomOffset();
  useNotificationNavigation();
  useGlobalShortcuts({
    onTogglePalette: () => setShowPalette((v) => !v),
    onQuickAdd: () => setShowQuickAdd(true),
  });

  useEffect(() => {
    if (onboardingDismissed) return;
    api.profile().then(setOnboardingProfile).catch(() => {});
  }, [onboardingDismissed]);

  const dismissOnboarding = () => {
    localStorage.setItem("zenith_onboarding_dismissed", "1");
    setOnboardingDismissed(true);
  };

  // /jobs/:id and /board/:id render a routed detail page (#314) instead
  // of the old pane/overlay duality — one presentation for every entry
  // point, back-button friendly.
  const routedJob =
    (tab === "applications" || tab === "board") && detailIdFromUrl != null
      ? visibleApps.find((a) => a.id === detailIdFromUrl) ?? null
      : null;

  // Primary destinations, rendered from one list into both the desktop rail
  // (.side) and the sub-900px .tabs bar so the two never drift. Settings is
  // pinned separately (rail foot / last tab). `data` drives the mobile
  // scroll-into-view probe (tabsRef).
  const navItems: NavItem[] = [
    { data: "overview", to: "overview", active: tab === "overview", icon: <NavOverviewIcon />, label: t("tabs.overview") },
    { data: "pipeline", to: "board", active: tab === "applications" || tab === "board", icon: <NavPipelineIcon />, label: t("tabs.pipeline") },
    { data: "feed", to: "feed", active: tab === "feed", icon: <NavFeedIcon />, label: t("tabs.feed") },
    { data: "calendar", to: "calendar", active: tab === "calendar", icon: <NavCalendarIcon />, label: t("tabs.calendar") },
    { data: "network", to: "companies", active: tab === "companies" || tab === "contacts", icon: <NavNetworkIcon />, label: t("tabs.network") },
    { data: "cv", to: "cv", active: tab === "cv", icon: <NavCvIcon />, label: t("tabs.cv") },
  ];
  const pageTitle =
    tab === "settings"
      ? t("settings.title")
      : (navItems.find((n) => n.active)?.label ?? t("tabs.overview"));
  const onboardingComplete =
    !!(onboardingProfile?.name && onboardingProfile?.email) &&
    companies.length > 0 &&
    applications.length > 0;
  const showOnboarding = !onboardingDismissed && !onboardingComplete;
  const onboardingProps = {
    profileDone: !!(onboardingProfile?.name && onboardingProfile?.email),
    companyDone: companies.length > 0,
    jobDone: applications.length > 0,
    onGoToProfile: () => setTab("cv"),
    onGoToCompanies: () => setTab("companies"),
    onAddJob: () => setShowQuickAdd(true),
    onDismiss: dismissOnboarding,
    onLoadSample: () => navigate("/settings?s=data"),
  };

  return (
    <div className="app">
      {showQuickAdd && (
        <QuickAddDialog
          companies={visibleCompanies}
          onClose={() => setShowQuickAdd(false)}
          onError={setError}
          onCreated={(a, open) => {
            setShowQuickAdd(false);
            notify(t("common.saved"));
            // Navigate on the optimistic append instead of blocking on the
            // five-endpoint reload — the page fills in as data lands.
            setApplications((prev) => [...prev, a]);
            if (open) navigate(`/jobs/${a.id}`);
            void reload();
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
            navigate(`/jobs/${id}`);
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
      <Sidebar
        navItems={navItems}
        settingsActive={tab === "settings"}
        onNavigate={setTab}
        onOpenSettings={() => setTab("settings")}
        user={sessionUser}
        userInitials={userInitials}
        onboarding={
          showOnboarding ? <OnboardingChecklist {...onboardingProps} /> : null
        }
      />
      <div className="main">
        <TopBar
          scrolled={scrolled}
          pageTitle={pageTitle}
          settingsActive={tab === "settings"}
          onSearch={() => setShowPalette(true)}
          onOpenSettings={() => setTab("settings")}
          onQuickAdd={() => setShowQuickAdd(true)}
        />
        <MobileTabs
          navItems={navItems}
          settingsActive={tab === "settings"}
          onNavigate={setTab}
          onOpenSettings={() => setTab("settings")}
          navRef={tabsRef}
        />

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

      <main className="content">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <Suspense fallback={<LoadingSkeleton />}>
            {tab === "overview" && showOnboarding && (
              <OnboardingChecklist {...onboardingProps} />
            )}
            {tab === "overview" && (
              <DashboardTab
                applications={visibleApps}
                fullApps={applications}
                onGoToJobs={() => setTab("board")}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
                onError={setError}
                onChanged={reload}
                stats={statsData}
                notify={notify}
                onOpenQuickAdd={() => setShowQuickAdd(true)}
              />
            )}
            {routedJob && (
              <section className="job-page">
                <button
                  className="btn-secondary job-back"
                  onClick={() => {
                    // Return to wherever the user came from — dashboard, feed,
                    // board — not always the pipeline (#448). location.key is
                    // "default" only on a direct deep-link with no in-app
                    // history; fall back to the board there.
                    if (location.key !== "default") navigate(-1);
                    else navigate("/board");
                  }}
                >
                  ← {t("common.back")}
                </button>
                <ApplicationDetailModal
                  key={routedJob.id}
                  application={routedJob}
                  allApplications={visibleApps}
                  companies={visibleCompanies}
                  contacts={visibleContacts}
                  roleTypes={roleTypes}
                  onClose={() => navigate("/board")}
                  onChanged={reload}
                  onError={setError}
                  notify={notify}
                  onDelete={deleteWithUndo}
                  onStatus={setStatus}
                  asPane
                />
              </section>
            )}
            {(tab === "applications" || tab === "board") && !routedJob && (
              <PipelineTab
                applications={visibleApps}
                companies={visibleCompanies}
                contacts={visibleContacts}
                roleTypes={roleTypes}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                onStatus={setStatus}
                initialQuery={jumpQuery}
                onQueryConsumed={() => setJumpQuery("")}
                history={statsData?.history ?? []}
                lastInteractions={statsData?.interactions ?? []}
                onOpenJob={(id: number | null) =>
                  navigate(id ? `/jobs/${id}` : "/board")
                }
                onOpenQuickAdd={() => setShowQuickAdd(true)}
                onOpenSampleData={() => navigate("/settings?s=data")}
              />
            )}
            {tab === "feed" && (
              <FeedTab
                onError={setError}
                notify={notify}
                roleTypes={roleTypes}
                onOpenSettings={() => navigate("/settings?s=feed")}
                onChanged={reload}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
              />
            )}
            {tab === "calendar" && (
              <CalendarTab
                onError={setError}
                onJump={(title) => {
                  setJumpQuery(title);
                  setTab("board");
                }}
              />
            )}
            {(tab === "companies" || tab === "contacts") && (
              <div
                className="subnav"
                role="tablist"
                aria-label={t("tabs.network")}
              >
                <button
                  role="tab"
                  aria-selected={tab === "companies"}
                  className={tab === "companies" ? "active" : ""}
                  onClick={() => setTab("companies")}
                >
                  {t("tabs.companies")}
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "contacts"}
                  className={tab === "contacts" ? "active" : ""}
                  onClick={() => setTab("contacts")}
                >
                  {t("tabs.people")}
                </button>
              </div>
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
            {tab === "settings" && (
              <SettingsPage
                roleTypes={roleTypes}
                onRoleTypesChanged={reload}
                notify={notify}
              />
            )}
          </Suspense>
        )}
      </main>
      </div>

      <ConfirmHost />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
