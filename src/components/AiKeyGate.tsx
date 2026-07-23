import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAiStatus } from "../ai-status-context";

// Gates a BYO-key AI panel: renders its children only once a key is configured,
// otherwise a compact prompt linking to Account settings — so the user learns
// the feature needs a key up front, not after clicking Start and getting a 400.
export interface AiKeyGateProps {
  children: ReactNode;
}

export function AiKeyGate({ children }: AiKeyGateProps) {
  const { configured, loading } = useAiStatus();
  const { t } = useTranslation();

  if (loading) return null;
  if (configured) return <>{children}</>;

  return (
    <p className="muted small ai-key-gate">
      {t("ai.needKey")}{" "}
      <Link to="/settings?s=account">{t("ai.needKeyLink")}</Link>
    </p>
  );
}
