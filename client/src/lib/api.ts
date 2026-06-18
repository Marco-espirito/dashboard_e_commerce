const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// ─── Token en mémoire (jamais dans localStorage) ─────────────────────────────
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ─── Refresh silencieux ───────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Si un refresh est déjà en cours on attend le même, pas de double requête
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include", // envoie le cookie httpOnly
    headers: { "X-Requested-With": "XMLHttpRequest" }, // protection CSRF
  })
    .then(async (res) => {
      if (!res.ok) { setAccessToken(null); return null; }
      const data = await res.json();
      setAccessToken(data.token);
      return data.token as string;
    })
    .catch(() => { setAccessToken(null); return null; })
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

// ─── Client HTTP ──────────────────────────────────────────────────────────────
interface ApiOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Usage interne : évite une boucle infinie lors du retry après refresh */
  _retry?: boolean;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, _retry = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // En-tête custom requis par la protection CSRF côté serveur.
    // Un attaquant cross-site ne peut pas le poser (déclenche un preflight CORS).
    "X-Requested-With": "XMLHttpRequest",
  };

  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  // Refresh silencieux sur 401 (sauf si c'est déjà un retry ou une route auth)
  if (res.status === 401 && auth && !_retry && !path.startsWith("/auth")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return api<T>(path, { ...options, _retry: true });
    }
    // Refresh échoué → on notifie l'app pour déclencher la déconnexion
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expirée");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Une erreur est survenue");
  }

  return data as T;
}
