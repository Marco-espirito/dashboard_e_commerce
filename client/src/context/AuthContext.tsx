import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, setAccessToken } from "../lib/api";
import type { User } from "../types";

/** Résultat d'un login : succès direct, ou challenge 2FA à compléter. */
export type LoginResult =
  | { twoFactorRequired: false; user: User }
  | { twoFactorRequired: true; challengeToken: string };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Au chargement : on tente un refresh silencieux pour restaurer la session
  // depuis le cookie httpOnly (survivra à un reload de page).
  // Le flag `cancelled` évite le double appel de React StrictMode en dev.
  useEffect(() => {
    let cancelled = false;

    api<{ token: string }>("/auth/refresh", { method: "POST", auth: false })
      .then(async (data) => {
        if (cancelled) return;
        setAccessToken(data.token);
        const me = await api<{ user: User }>("/auth/me");
        if (!cancelled) setUser(me.user);
      })
      .catch(() => {
        if (!cancelled) { setAccessToken(null); setUser(null); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // L'intercepteur 401 de api.ts émet cet événement si le refresh échoue
  useEffect(() => {
    function handleForceLogout() {
      setAccessToken(null);
      setUser(null);
    }
    window.addEventListener("auth:logout", handleForceLogout);
    return () => window.removeEventListener("auth:logout", handleForceLogout);
  }, []);

  async function login(email: string, password: string): Promise<LoginResult> {
    const data = await api<{
      token?: string;
      user?: User;
      twoFactorRequired?: boolean;
      challengeToken?: string;
    }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });

    // 2FA active : pas encore de session, on renvoie le challenge à compléter.
    if (data.twoFactorRequired && data.challengeToken) {
      return { twoFactorRequired: true, challengeToken: data.challengeToken };
    }

    setAccessToken(data.token!);
    setUser(data.user!);
    return { twoFactorRequired: false, user: data.user! };
  }

  async function verifyTwoFactor(challengeToken: string, code: string): Promise<User> {
    const data = await api<{ token: string; user: User }>("/auth/login/2fa", {
      method: "POST",
      body: { challengeToken, code },
      auth: false,
    });
    setAccessToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    // Efface le cookie côté serveur (best-effort, on ne bloque pas sur l'erreur)
    api("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTwoFactor, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
