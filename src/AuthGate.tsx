import type { ReactNode } from "react";
import { useSession } from "./auth-client";
import { Login } from "./Login";

export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  if (isPending) return null;
  if (!session) return <Login />;
  return children;
}
