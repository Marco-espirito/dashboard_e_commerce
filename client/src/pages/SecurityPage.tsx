import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  fetchTwoFactorStatus,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
} from "../lib/queries";

export function SecurityPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.twoFactorStatus(),
    queryFn: fetchTwoFactorStatus,
  });
  const enabled = data?.enabled ?? false;

  // Étapes de configuration : 'idle' → 'configuring' (QR affiché) → terminé
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [disabling, setDisabling] = useState(false);

  function resetFlow() {
    setQrCode(null);
    setCode("");
    setError("");
    setDisabling(false);
  }

  const setupMutation = useMutation({
    mutationFn: setupTwoFactor,
    onSuccess: (res) => { setQrCode(res.qrCode); setError(""); },
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  const enableMutation = useMutation({
    mutationFn: () => enableTwoFactor(code.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.twoFactorStatus() });
      resetFlow();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Code invalide"),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableTwoFactor(code.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.twoFactorStatus() });
      resetFlow();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Code invalide"),
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Sécurité</h1>
      <p className="mt-1 text-sm text-slate-500">
        Renforce la protection de ton compte avec la double authentification.
      </p>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Double authentification (2FA)
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Un code temporaire généré par ton téléphone sera demandé à chaque connexion.
            </p>
          </div>
          <span
            className={
              enabled
                ? "shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                : "shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            }
          >
            {isLoading ? "…" : enabled ? "Activée" : "Désactivée"}
          </span>
        </div>

        {/* ── État désactivé : bouton d'activation + flux QR ── */}
        {!isLoading && !enabled && !qrCode && !disabling && (
          <button
            onClick={() => { setError(""); setupMutation.mutate(); }}
            disabled={setupMutation.isPending}
            className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {setupMutation.isPending ? "Préparation…" : "Activer la 2FA"}
          </button>
        )}

        {/* ── Flux de configuration : scan du QR + saisie du code ── */}
        {qrCode && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <ol className="space-y-4 text-sm text-slate-600">
              <li>
                <span className="font-medium text-slate-900">1.</span> Scanne ce QR code
                avec Google Authenticator, Authy, ou ton gestionnaire de mots de passe.
                <div className="mt-3 flex justify-center">
                  <img
                    src={qrCode}
                    alt="QR code 2FA"
                    className="h-44 w-44 rounded-lg border border-slate-200"
                  />
                </div>
              </li>
              <li>
                <span className="font-medium text-slate-900">2.</span> Saisis le code à 6
                chiffres affiché pour confirmer.
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="mt-2 w-40 rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </li>
            </ol>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => enableMutation.mutate()}
                disabled={code.length < 6 || enableMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {enableMutation.isPending ? "Activation…" : "Confirmer l'activation"}
              </button>
              <button
                onClick={resetFlow}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── État activé : désactivation (code requis) ── */}
        {!isLoading && enabled && !disabling && (
          <button
            onClick={() => { setError(""); setDisabling(true); }}
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            Désactiver la 2FA
          </button>
        )}

        {enabled && disabling && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-600">
              Saisis un code de ton application d'authentification pour confirmer la désactivation.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="mt-3 w-40 rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => disableMutation.mutate()}
                disabled={code.length < 6 || disableMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {disableMutation.isPending ? "Désactivation…" : "Confirmer la désactivation"}
              </button>
              <button
                onClick={resetFlow}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
