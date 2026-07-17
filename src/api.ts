async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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
  update: <T>(resource: string, id: number, data: unknown) =>
    request<T>(`/api/${resource}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  setStatus: <T>(id: number, status: string) =>
    request<T>(`/api/applications/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  remove: (resource: string, id: number) =>
    request<void>(`/api/${resource}/${id}`, { method: "DELETE" }),
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
  researchCompany: (id: number) =>
    request<import("./types").Company>(`/api/companies/${id}/research`, {
      method: "POST",
    }),
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
