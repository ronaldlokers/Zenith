import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { AiStatusContext } from "./ai-status-context";

// Single source of truth for whether the user has a BYO Anthropic key
// configured. Fetched once (the endpoint is write-only — it returns only
// {configured, hint}), shared by every AI surface so panels can gate
// themselves and Account settings can reflect changes live. Lives under
// AuthGate, so it only mounts for signed-in users.
export function AiStatusProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    api
      .getAiCredentials()
      .then((r) => {
        setConfigured(r.configured);
        setHint(r.hint);
      })
      .catch(() => {
        setConfigured(false);
        setHint(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AiStatusContext.Provider value={{ configured, hint, loading, refresh }}>
      {children}
    </AiStatusContext.Provider>
  );
}
