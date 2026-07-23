import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { requestConfirm } from "../hooks";
import { Button } from "../components";

// Per-user sample data (#281) — a new/invited user can fill an empty
// account with the example dataset to explore, then wipe it in one click.
// A full reload after either action is the simplest way to refresh every
// tab's data at once.
export function SampleDataSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{
    loaded: boolean;
    hasData: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sampleDataStatus()
      .then(setStatus)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!status) return null;
  // Nothing to offer once the account has real (non-sample) data.
  if (status.hasData && !status.loaded) return null;

  const load = () => {
    setBusy(true);
    api
      .loadSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };
  const clear = async () => {
    if (!(await requestConfirm(t("sampleData.clearConfirm")))) return;
    setBusy(true);
    api
      .clearSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };

  return (
    <div className="sample-data">
      <h3>{t("sampleData.title")}</h3>
      {status.loaded ? (
        <>
          <p className="muted small">{t("sampleData.loadedHint")}</p>
          <Button variant="secondary" disabled={busy} onClick={clear}>
            {t("sampleData.clear")}
          </Button>
        </>
      ) : (
        <>
          <p className="muted small">{t("sampleData.emptyHint")}</p>
          <Button variant="primary" disabled={busy} onClick={load}>
            {t("sampleData.load")}
          </Button>
        </>
      )}
    </div>
  );
}

export function ResetDemoData() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
      setMessage(
        res.ok ? t("account.resetDemoSuccess") : t("account.resetDemoError"),
      );
    } catch {
      setMessage(t("account.resetDemoError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.resetDemo")}</h3>
      {message && <p className="admin-invite-success">{message}</p>}
      <Button variant="secondary" disabled={busy} onClick={reset}>
        {t("account.resetDemoSubmit")}
      </Button>
    </div>
  );
}
