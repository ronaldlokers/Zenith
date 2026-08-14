import i18n from "./i18n";
// The message a failed write actually shows the user. Everything below the
// HTTP layer — no connection, DNS gone, the tab woken from sleep — surfaces
// from fetch() as a TypeError reading "Failed to fetch", and that string was
// going straight into the app's error banner: browser jargon, untranslated
// in a Dutch UI, naming neither the problem nor anything to do about it.
//
// Importing i18n here rather than threading a t() through every call site.
// api.ts is only ever called from handlers, long after i18n has initialized
// — the same reasoning cv-snapshot.ts uses. (format.ts avoids the import
// because it runs during render, which is a different position.)
function networkErrorMessage(method?: string): string {
  // A read and a write fail differently to the person reading the message.
  // Both used the write wording, so a page that would not load announced
  // "that change wasn't saved" over a screen where nothing had been changed.
  const read = !method || method.toUpperCase() === "GET";
  // navigator.onLine is only trustworthy when it says false: a browser can
  // report "online" while attached to a network that reaches nothing. So it
  // is used to add certainty, never to withhold it.
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return i18n.t(read ? "errors.offlineRead" : "errors.offline");
  return i18n.t(read ? "errors.unreachableRead" : "errors.unreachable");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      // Merged, not replaced. Spreading init over a headers key dropped the
      // default outright, so any call that set a header of its own sent its
      // JSON body as text/plain — the If-Match saves, in practice. Hono
      // parses the body regardless, so nothing broke; it was a request that
      // described itself wrongly and worked by the leniency of one parser.
      //
      // The caller still wins on a key it sets. Nothing in this file needs
      // that today — the one call that sends its own content type, the
      // document upload, uses fetch directly rather than going through here —
      // so it is the safe direction to merge in rather than a dependency.
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new Error(networkErrorMessage(init?.method));
  }
  // A 401 from this client means one thing: the session is gone. Sign-in
  // goes through auth-client, not through here, so nothing else can produce
  // it — and the server's own word for it ("unauthorized") reached the user
  // as the entire explanation, on a page that still looked signed in. They
  // were left clicking controls that would keep failing, with no indication
  // that signing in again was the answer.
  //
  // Not an automatic redirect: that would throw away whatever is half-typed
  // on the screen, and deciding to navigate out from under someone is a
  // product call rather than an error-handling one. Saying plainly what
  // happened is the part that is unambiguously right.
  if (res.status === 401) {
    throw new Error(i18n.t("errors.sessionExpired"));
  }
  // A precondition that failed: the row moved on under the form. The server
  // knows what happened and the wire says "the application changed somewhere
  // else"; the person needs to be told their copy is out of date and that
  // nothing was lost, which is a different sentence.
  if (res.status === 412) {
    throw new Error(i18n.t("errors.staleEdit"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  list: <T>(resource: string) => request<T[]>(`/api/${resource}`),
  create: <T>(resource: string, data: unknown) =>
    request<T>(`/api/${resource}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // `expectedUpdatedAt` sends an If-Match precondition, so a save built on a
  // row that has since changed elsewhere is refused rather than silently
  // overwriting the parts it did not know about. Optional: callers that omit
  // it keep the old last-write-wins behaviour, which is what the narrower
  // panels want — they write one field they have just read.
  update: <T>(
    resource: string,
    id: number,
    data: unknown,
    expectedUpdatedAt?: string | null,
  ) =>
    request<T>(`/api/${resource}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      ...(expectedUpdatedAt ? { headers: { "If-Match": expectedUpdatedAt } } : {}),
    }),
  setStatus: <T>(id: number, status: string) =>
    request<T>(`/api/applications/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  // Why an application ended (#381) — lands on its latest terminal transition,
  // which the server resolves. A null reason clears both fields.
  setOutcome: (id: number, reason: string | null, note: string | null) =>
    request<{ outcome_reason: string | null; outcome_note: string | null }>(
      `/api/applications/${id}/outcome`,
      { method: "PUT", body: JSON.stringify({ reason, note }) },
    ),
  // Mirror the UI language into the user row so the worker can localize the
  // content it generates (weekly digest). Fire-and-forget from the caller.
  setLocale: (locale: string) =>
    request<void>("/api/preferences/locale", {
      method: "PUT",
      body: JSON.stringify({ locale }),
    }),
  getPreferences: () =>
    request<{
      locale: string | null;
      timezone: string | null;
      emailReminders: boolean;
      emailDigest: boolean;
    }>("/api/preferences"),
  // The server compares date-only columns against the user's own calendar
  // day; without this it can only use UTC.
  setTimezone: (timezone: string) =>
    request<void>("/api/preferences/timezone", {
      method: "PUT",
      body: JSON.stringify({ timezone }),
    }),
  setEmailPreferences: (prefs: { emailReminders?: boolean; emailDigest?: boolean }) =>
    request<void>("/api/preferences/email", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),
  // Admin: send yourself a sample push of the given notification type.
  testPush: (type: string) =>
    request<{ sent: number }>("/api/admin/test-push", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
  // Admin: send yourself a sample email, bypassing the reminders/digest
  // preference toggles — this checks whether the transport is configured,
  // not what the user opted into. Rejects with the provider's own error
  // text (bad key, unverified domain, ...) rather than a generic failure.
  testEmail: (type: string) =>
    request<{ sent: boolean; provider: string }>("/api/admin/test-email", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
  // BYO Claude key. The key itself is never returned — only whether one is
  // configured and its last-4 hint.
  getAiCredentials: () =>
    request<{ configured: boolean; hint: string | null }>(
      "/api/ai/credentials",
    ),
  setAiKey: (apiKey: string) =>
    request<{ configured: boolean; hint: string }>("/api/ai/credentials", {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),
  deleteAiKey: () =>
    request<void>("/api/ai/credentials", { method: "DELETE" }),
  // Tailor the CV to a job description via the user's own Anthropic key.
  tailorCv: (jobDescription: string) =>
    request<{
      summary: string;
      experiences: { id: number; description: string }[];
    }>("/api/ai/tailor-cv", {
      method: "POST",
      body: JSON.stringify({ jobDescription }),
    }),
  linkedinReview: (input: { headline: string; about: string }) =>
    request<{ headline: string; about: string; tips: string[] }>(
      "/api/ai/linkedin-review",
      { method: "POST", body: JSON.stringify(input) },
    ),
  // One turn of a mock interview; the caller holds the transcript.
  mockInterview: (
    context: { title?: string; company?: string; jobDescription?: string },
    messages: { role: "user" | "assistant"; content: string }[],
  ) =>
    request<{ reply: string }>("/api/ai/mock-interview", {
      method: "POST",
      body: JSON.stringify({ context, messages }),
    }),
  // One turn of a salary-negotiation roleplay; the caller holds the transcript.
  negotiation: (
    context: {
      title?: string;
      company?: string;
      salaryExpectation?: string;
      jobDescription?: string;
    },
    messages: { role: "user" | "assistant"; content: string }[],
  ) =>
    request<{ reply: string }>("/api/ai/negotiation", {
      method: "POST",
      body: JSON.stringify({ context, messages }),
    }),
  updateFollowUp: (
    id: number,
    fields: { next_action?: string | null; next_action_at: string | null },
  ) =>
    request<import("./types").Application>(
      `/api/applications/${id}/follow-up`,
      { method: "PATCH", body: JSON.stringify(fields) },
    ),
  patchApplication: (
    id: number,
    fields: {
      notes?: string | null;
      fit_score?: number | null;
      cover_letter?: string | null;
    },
  ) =>
    request<import("./types").Application>(`/api/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
  // A narrow write: only the fields named in the body. The PUT routes write
  // every column, so a panel holding a record it loaded earlier reverts
  // everything it never showed — see test/cover-letter-clobber.spec.ts and
  // test/contact-clobber.spec.ts. A panel that owns one field uses this.
  patch: <T>(resource: string, id: number, fields: Record<string, unknown>) =>
    request<T>(`/api/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
  remove: (resource: string, id: number) =>
    request<void>(`/api/${resource}/${id}`, { method: "DELETE" }),
  savedViews: () =>
    request<import("./types").SavedView[]>("/api/saved-views"),
  createSavedView: (name: string, filters: import("./types").JobFilters) =>
    request<import("./types").SavedView>("/api/saved-views", {
      method: "POST",
      body: JSON.stringify({ name, filters }),
    }),
  deleteSavedView: (id: number) =>
    request<void>(`/api/saved-views/${id}`, { method: "DELETE" }),
  sampleDataStatus: () =>
    request<{ loaded: boolean; hasData: boolean }>("/api/account/sample-data"),
  loadSampleData: () =>
    request<{ loaded: boolean }>("/api/account/sample-data", {
      method: "POST",
    }),
  clearSampleData: () =>
    request<void>("/api/account/sample-data", { method: "DELETE" }),
  resetUser2fa: (id: string) =>
    request<void>(`/api/admin/users/${id}/reset-2fa`, { method: "POST" }),
  deleteAccount: () => request<void>("/api/account", { method: "DELETE" }),
  interactions: (resource: "applications" | "contacts", id: number) =>
    request<import("./types").Interaction[]>(
      `/api/${resource}/${id}/interactions`,
    ),
  addInteraction: (
    resource: "applications" | "contacts",
    id: number,
    data: unknown,
  ) =>
    request<import("./types").Interaction>(`/api/${resource}/${id}/interactions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  stats: () => request<import("./types").Stats>("/api/stats"),
  roleTypes: () => request<import("./types").RoleTypeDef[]>("/api/role-types"),
  createRoleType: (label: string) =>
    request<import("./types").RoleTypeDef>("/api/role-types", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  updateRoleType: (id: number, data: { label: string; sort_order?: number }) =>
    request<import("./types").RoleTypeDef>(`/api/role-types/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteRoleType: (id: number) =>
    request<void>(`/api/role-types/${id}`, { method: "DELETE" }),
  feedConfig: () =>
    request<{
      sources: { source: string; enabled: number; location: string | null }[];
      keywords: { id: number; role_slug: string; keyword: string }[];
    }>("/api/feed/config"),
  updateFeedSource: (
    source: string,
    data: { enabled: boolean; location: string | null },
  ) =>
    request(`/api/feed/config/sources/${source}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  addFeedKeyword: (role_slug: string, keyword: string) =>
    request("/api/feed/config/keywords", {
      method: "POST",
      body: JSON.stringify({ role_slug, keyword }),
    }),
  deleteFeedKeyword: (id: number) =>
    request<void>(`/api/feed/config/keywords/${id}`, { method: "DELETE" }),
  agenda: () => request<import("./types").AgendaEntry[]>("/api/agenda"),
  activity: () =>
    request<import("./types").ActivityEvent[]>("/api/activity"),
  feed: (cursor?: import("./types").FeedCursor | null) => {
    const q = cursor
      ? `?cursorK=${encodeURIComponent(cursor.k)}&cursorId=${cursor.id}`
      : "";
    return request<{
      items: import("./types").FeedItem[];
      nextCursor: import("./types").FeedCursor | null;
    }>(`/api/feed${q}`);
  },
  refreshFeed: () =>
    request<{ inserted: number; seen: number }>("/api/feed/refresh", {
      method: "POST",
    }),
  dismissFeedItem: (id: number) =>
    request<void>(`/api/feed/${id}/dismiss`, { method: "POST" }),
  saveFeedItem: (id: number) =>
    request<void>(`/api/feed/${id}/save`, { method: "POST" }),
  unsaveFeedItem: (id: number) =>
    request<void>(`/api/feed/${id}/unsave`, { method: "POST" }),
  undismissFeedItem: (id: number) =>
    request<void>(`/api/feed/${id}/undismiss`, { method: "POST" }),
  addFeedItem: (id: number) =>
    request<import("./types").Application>(`/api/feed/${id}/add`, {
      method: "POST",
    }),
  feedBlocklist: () =>
    request<{ id: number; company: string }[]>("/api/feed/blocklist"),
  blockFeedCompany: (company: string) =>
    request<{ id: number; company: string }>("/api/feed/blocklist", {
      method: "POST",
      body: JSON.stringify({ company }),
    }),
  unblockFeedCompany: (id: number) =>
    request<void>(`/api/feed/blocklist/${id}`, { method: "DELETE" }),
  atsBoards: () => request<import("./types").AtsBoard[]>("/api/feed/ats-boards"),
  addAtsBoard: (source: "greenhouse" | "ashby", slug: string) =>
    request<import("./types").AtsBoard>("/api/feed/ats-boards", {
      method: "POST",
      body: JSON.stringify({ source, slug }),
    }),
  removeAtsBoard: (id: number) =>
    request<void>(`/api/feed/ats-boards/${id}`, { method: "DELETE" }),
  notifications: () =>
    request<import("./types").AppNotification[]>("/api/notifications"),
  markNotificationRead: (id: number) =>
    request<void>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<void>("/api/notifications/read-all", { method: "POST" }),
  pushPublicKey: () =>
    request<{ publicKey: string | null }>("/api/push/public-key"),
  pushSubscribe: (subscription: PushSubscriptionJSON) =>
    request<void>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  pushUnsubscribe: (endpoint: string) =>
    request<void>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  importUrl: (url: string) =>
    request<import("./types").ImportResult>(
      `/api/import?url=${encodeURIComponent(url)}`,
    ),
  documents: (applicationId: number) =>
    request<import("./types").Document[]>(
      `/api/applications/${applicationId}/documents`,
    ),
  uploadDocument: async (
    applicationId: number,
    file: File,
    label: string | null,
  ) => {
    const params = new URLSearchParams({ filename: file.name });
    if (label) params.set("label", label);
    const res = await fetch(
      `/api/applications/${applicationId}/documents?${params}`,
      {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `Upload failed (${res.status})`,
      );
    }
    return res.json() as Promise<import("./types").Document>;
  },
  profile: () => request<import("./types").Profile>("/api/profile"),
  updateProfile: (data: Partial<import("./types").Profile>) =>
    request<import("./types").Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // Which board stages are folded (#535 shell). Sent whole rather than as a
  // toggle: the server stores the canonical set, so there is nothing to
  // reconcile if two tabs disagree.
  setBoardFolded: (folded: string[]) =>
    request<{ board_folded: string[] }>("/api/profile/board-folded", {
      method: "PUT",
      body: JSON.stringify({ folded }),
    }),
  setShareIdentity: (show: boolean) =>
    request<{ share_show_identity: boolean }>("/api/profile/share-identity", {
      method: "PUT",
      body: JSON.stringify({ show }),
    }),
  goals: () => request<import("./types").UserGoal>("/api/goals"),
  setGoals: (data: {
    weekly_app_goal: number;
    search_started_at: string | null;
  }) =>
    request<import("./types").UserGoal>("/api/goals", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  skills: () => request<import("./types").Skill[]>("/api/skills"),
  addWorkExperienceSkill: (workExperienceId: number, name: string) =>
    request<import("./types").Skill>(
      `/api/work-experience/${workExperienceId}/skills`,
      { method: "POST", body: JSON.stringify({ name }) },
    ),
  removeWorkExperienceSkill: (workExperienceId: number, skillId: number) =>
    request<void>(
      `/api/work-experience/${workExperienceId}/skills/${skillId}`,
      { method: "DELETE" },
    ),
  tags: () => request<import("./types").Tag[]>("/api/tags"),
  addApplicationTag: (applicationId: number, name: string) =>
    request<import("./types").Tag>(
      `/api/applications/${applicationId}/tags`,
      { method: "POST", body: JSON.stringify({ name }) },
    ),
  removeApplicationTag: (applicationId: number, tagId: number) =>
    request<void>(`/api/applications/${applicationId}/tags/${tagId}`, {
      method: "DELETE",
    }),
  reorderApplicationTag: (applicationId: number, tagId: number, sortOrder: number) =>
    request<void>(`/api/applications/${applicationId}/tags/${tagId}`, {
      method: "PATCH",
      body: JSON.stringify({ sort_order: sortOrder }),
    }),
  archiveApplication: (id: number) =>
    request<import("./types").Application>(`/api/applications/${id}/archive`, {
      method: "POST",
    }),
  unarchiveApplication: (id: number) =>
    request<import("./types").Application>(
      `/api/applications/${id}/unarchive`,
      { method: "POST" },
    ),
  pinApplication: (id: number) =>
    request<import("./types").Application>(`/api/applications/${id}/pin`, {
      method: "POST",
    }),
  unpinApplication: (id: number) =>
    request<import("./types").Application>(`/api/applications/${id}/unpin`, {
      method: "POST",
    }),
  generateShareToken: () =>
    request<{ share_token: string }>("/api/profile/share-token", {
      method: "POST",
    }),
  revokeShareToken: () =>
    request<void>("/api/profile/share-token", { method: "DELETE" }),
  generateCalendarToken: () =>
    request<{ calendar_token: string }>("/api/profile/calendar-token", {
      method: "POST",
    }),
  revokeCalendarToken: () =>
    request<void>("/api/profile/calendar-token", { method: "DELETE" }),
  generateApiKey: () =>
    request<{ api_key: string }>("/api/profile/api-key", { method: "POST" }),
  revokeApiKey: () =>
    request<void>("/api/profile/api-key", { method: "DELETE" }),
  webhooks: () => request<import("./types").Webhook[]>("/api/webhooks"),
  addWebhook: (url: string) =>
    request<import("./types").Webhook & { secret: string }>("/api/webhooks", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  removeWebhook: (id: number) =>
    request<void>(`/api/webhooks/${id}`, { method: "DELETE" }),
};
