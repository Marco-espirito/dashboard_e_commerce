const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Une erreur est survenue");
  }

  return data as T;
}
