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
      <h1 className="admin-page-title">{t("admin.title")}</h1>
      <p className="admin-page-sub muted">{t("admin.subtitle")}</p>
      <div className="settings-page">
        <SettingsNav
          sections={ADMIN_SECTIONS.map((s) => ({ key: s, label: t(`admin.section.${s}`) }))}
          active={section}
          onSelect={setSection}
          aria-label={t("admin.navLabel")}
        />
        <div className="admin-content">
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
