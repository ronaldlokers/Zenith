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
  interactions: (applicationId: number) =>
    request<import("./types").Interaction[]>(
      `/api/applications/${applicationId}/interactions`,
    ),
  addInteraction: (applicationId: number, data: unknown) =>
    request<import("./types").Interaction>(
      `/api/applications/${applicationId}/interactions`,
      { method: "POST", body: JSON.stringify(data) },
    ),
};
