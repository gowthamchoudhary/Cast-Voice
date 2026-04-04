const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useApi() {
  function get(path: string) {
    const url = path.startsWith("/api/") ? `${BASE_URL}${path}` : path;
    return fetch(url, { credentials: "include" });
  }

  function post(path: string, body?: unknown) {
    const url = path.startsWith("/api/") ? `${BASE_URL}${path}` : path;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  function put(path: string, body?: unknown) {
    const url = path.startsWith("/api/") ? `${BASE_URL}${path}` : path;
    return fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  function patch(path: string, body?: unknown) {
    const url = path.startsWith("/api/") ? `${BASE_URL}${path}` : path;
    return fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  function del(path: string) {
    const url = path.startsWith("/api/") ? `${BASE_URL}${path}` : path;
    return fetch(url, {
      method: "DELETE",
      credentials: "include",
    });
  }

  return { get, post, put, patch, del };
}
