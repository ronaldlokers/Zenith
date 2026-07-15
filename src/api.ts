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
};
