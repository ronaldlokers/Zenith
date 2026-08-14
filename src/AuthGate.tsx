import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "./auth-client";
import { Login } from "./Login";
import { Button } from "./components";

export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const { t } = useTranslation();

  // Blank only until the FIRST session resolution. better-auth refetches the
  // session right after a sign-in — including a 2FA-pending sign-in, which
  // returns no full session. If we blanked on every isPending, <Login> would
  // unmount mid-flow and its needsTwoFactor state would reset: the code prompt
  // flashes for a frame, then reverts to the password screen (the 2FA login
  // bug). Keeping <Login> mounted through later refetches preserves its state.
  const resolvedOnce = useRef(false);
  useEffect(() => {
    if (!isPending) resolvedOnce.current = true;
  }, [isPending]);

  if (isPending && !resolvedOnce.current) return null;

  // "No session" and "could not ask" are not the same answer, and offline the
  // session check fails like any other request. Reloading while offline
  // therefore presented the sign-in form — which cannot work without the
  // network — so being offline read as having been logged out and locked out,
  // when the session was intact the whole time.
  //
  // navigator.onLine is trusted only when it says false, which is the rule
  // api.ts already follows: a browser can report "online" while attached to a
  // network that reaches nothing, so this narrows the case rather than
  // widening it. Anyone genuinely signed out, online, still gets the form.
  if (!session && typeof navigator !== "undefined" && navigator.onLine === false) {
    return (
      <main className="login-stage">
        <div className="login-card">
          <p role="status">{t("errors.offlineRead")}</p>
          <Button variant="primary" onClick={() => location.reload()}>
            {t("common.retry")}
          </Button>
        </div>
      </main>
    );
  }
  if (!session) return <Login />;
  return children;
}
