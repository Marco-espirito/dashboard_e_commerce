import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  fetchSessions,
  revokeSession,
  revokeOtherSessions,
  type Session,
} from "../lib/queries";

// ─── Helpers d'affichage ───────────────────────────────────────────────────────

/** Déduit un libellé navigateur + OS lisible à partir du user-agent. */
function describeDevice(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Appareil inconnu", os: "" };

  let browser = "Navigateur inconnu";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return { browser, os };
}

/** Formate une date ISO en date/heure française lisible. */
function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Délai relatif court ("il y a 5 min", "il y a 2 h"…). */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

// ─── Icône appareil ──────────────────────────────────────────────────────────

function DeviceIcon({ ua }: { ua: string | null }) {
  const isMobile = ua ? /Android|iPhone|iPad|Mobile/.test(ua) : false;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      {isMobile ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function SessionsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sessions(),
    queryFn: fetchSessions,
  });
  const sessions = data?.sessions ?? [];
  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  const revokeOne = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions() }),
    onError: (err) => alert(err instanceof Error ? err.message : "Erreur"),
  });

  const revokeOthers = useMutation({
    mutationFn: () => revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions() }),
    onError: (err) => alert(err instanceof Error ? err.message : "Erreur"),
  });

  function handleRevoke(s: Session) {
    if (!confirm("Déconnecter cet appareil ?")) return;
    revokeOne.mutate(s.id);
  }

  function handleRevokeOthers() {
    if (!confirm("Déconnecter tous les autres appareils ?")) return;
    revokeOthers.mutate();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sessions actives</h1>
          <p className="mt-1 text-sm text-slate-500">
            Appareils connectés à ton compte. Révoque une session si tu ne la reconnais pas.
          </p>
        </div>
        {otherCount > 0 && (
          <button
            onClick={handleRevokeOthers}
            disabled={revokeOthers.isPending}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
          >
            {revokeOthers.isPending
              ? "Déconnexion…"
              : `Déconnecter les autres appareils (${otherCount})`}
          </button>
        )}
      </div>

      <div className="mt-8 space-y-3">
        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-400">
            Chargement…
          </p>
        ) : sessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-400">
            Aucune session active.
          </p>
        ) : (
          sessions.map((s) => {
            const { browser, os } = describeDevice(s.userAgent);
            return (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <DeviceIcon ua={s.userAgent} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {browser}
                      {os && <span className="text-slate-400"> · {os}</span>}
                    </span>
                    {s.isCurrent && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Session actuelle
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    {s.ipAddress && <span>IP&nbsp;{s.ipAddress}</span>}
                    <span>Active {relativeTime(s.lastUsedAt)}</span>
                    <span>Connecté le {formatDateTime(s.createdAt)}</span>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    onClick={() => handleRevoke(s)}
                    disabled={revokeOne.isPending}
                    className="shrink-0 text-xs font-medium text-red-600 transition hover:text-red-800 disabled:opacity-50"
                  >
                    Déconnecter
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
