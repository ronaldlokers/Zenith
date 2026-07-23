import { useTranslation } from "react-i18next";
import { AdminUsers, AdminInvite, TestPush } from "./settings/admin";

// Dedicated admin area (#457) — lifted out of Settings, where user management,
// invites, demo reset and test-push were stacked in one overloaded tab. Its
// own page, admin-only (App gates the route on role), laid out as a card grid.
export function AdminPage({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="admin-page">
      <h1 className="admin-page-title">{t("admin.title")}</h1>
      <p className="admin-page-sub muted">{t("admin.subtitle")}</p>
      <div className="admin-grid">
        <AdminUsers onError={onError} />
        <AdminInvite />
        <TestPush onError={onError} />
      </div>
    </section>
  );
}
