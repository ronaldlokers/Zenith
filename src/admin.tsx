import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { SettingsNav } from "./components";
import { AdminUsers, AdminInvite, TestPush, TestEmail } from "./settings/admin";
import { ResetDemoData } from "./settings/data";

// Dedicated admin area (#457) — lifted out of Settings, where user management,
// invites, demo reset and test-push were stacked in one overloaded tab. Its
// own page, admin-only (App gates the route on role). A section nav (#469)
// mirrors Settings: one section at a time, deep-linkable via ?s=.
type AdminSection = "users" | "invites" | "demo" | "notifications";

const ADMIN_SECTIONS: AdminSection[] = [
  "users",
  "invites",
  "demo",
  "notifications",
];

export function AdminPage({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("s");
  const [section, setSection] = useState<AdminSection>(
    ADMIN_SECTIONS.includes(requested as AdminSection)
      ? (requested as AdminSection)
      : "users",
  );
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("s");
    if (q && ADMIN_SECTIONS.includes(q as AdminSection)) {
      setSection(q as AdminSection);
    }
  }, [location.search]);

  return (
    <section className="admin-page">
      {/* No h1 here. The shell's top bar already renders the page title as
          the document's h1 — every other tab relies on that and only this
          one also rendered its own, so "Admin" appeared twice on screen and
          the page carried two h1 elements. The outline then ran h1 > h1 > h3
          with no h2 between them.

          The section heading below is the h2, mirroring Settings
          (settings/index.tsx), which shares the same two-pane shell and the
          same h3-bearing section components — several of them literally the
          same components, which is why their h3s cannot simply be promoted:
          under Settings they already sit correctly beneath an h2. */}
      <p className="admin-page-sub muted">{t("admin.subtitle")}</p>
      <div className="settings-page">
        <SettingsNav
          sections={ADMIN_SECTIONS.map((s) => ({ key: s, label: t(`admin.section.${s}`) }))}
          active={section}
          onSelect={setSection}
          aria-label={t("admin.navLabel")}
        />
        <div className="admin-content">
          <h2 className="admin-page-title">{t(`admin.section.${section}`)}</h2>
          {section === "users" && <AdminUsers onError={onError} />}
          {section === "invites" && <AdminInvite />}
          {section === "demo" && <ResetDemoData />}
          {section === "notifications" && (
            <>
              <TestPush onError={onError} />
              <TestEmail onError={onError} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
