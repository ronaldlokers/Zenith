import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // No onTwoFactorRedirect callback — this app has no separate hosted
  // auth pages, so Login.tsx branches on signIn.email()'s returned
  // `data.twoFactorRedirect` directly instead (#211).
  plugins: [adminClient(), twoFactorClient()],
});

export const { useSession, signIn, signOut } = authClient;
