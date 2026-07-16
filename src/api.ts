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
  feed: () => request<import("./types").FeedItem[]>("/api/feed"),
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
};
