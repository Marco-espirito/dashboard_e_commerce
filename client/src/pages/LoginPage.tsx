import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Étape 2FA : si non-null, on affiche le champ code au lieu du formulaire.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function redirectByRole(role: string) {
    navigate(role === "ADMIN" ? "/admin" : "/membre", { replace: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.twoFactorRequired) {
        setChallengeToken(result.challengeToken);
      } else {
        redirectByRole(result.user.role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await verifyTwoFactor(challengeToken!, code.trim());
      redirectByRole(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">
            ●
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {challengeToken ? "Vérification en deux étapes" : "Connexion"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {challengeToken
              ? "Saisis le code à 6 chiffres de ton application d'authentification"
              : "Accède à ton espace"}
          </p>
        </div>

        {challengeToken ? (
          <form
            onSubmit={handleVerify}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Code de vérification
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                placeholder="123456"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || code.length < 6}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Vérification…" : "Vérifier"}
            </button>

            <button
              type="button"
              onClick={() => { setChallengeToken(null); setCode(""); setError(""); }}
              className="w-full text-center text-sm text-slate-500 transition hover:text-slate-900"
            >
              ← Revenir à la connexion
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
