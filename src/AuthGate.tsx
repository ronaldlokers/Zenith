import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "./auth-client";
import { Login } from "./Login";

export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

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
  if (!session) return <Login />;
  return children;
}
