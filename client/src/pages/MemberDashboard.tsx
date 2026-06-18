import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function MemberDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-teal-50">
      <header className="border-b border-teal-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-teal-600 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Membre
            </span>
            <span className="text-sm text-slate-600">{user?.name}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 transition hover:text-slate-900"
          >
            Se déconnecter
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-2xl font-semibold text-white">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Bonjour {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 text-slate-500">
            Bienvenue dans ton espace personnel.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-teal-100 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Mes informations
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Nom</dt>
              <dd className="font-medium text-slate-900">{user?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Rôle</dt>
              <dd>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                  Membre
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          Tu n'as pas accès à la gestion des membres. Contacte un administrateur
          pour toute modification.
        </p>
      </main>
    </div>
  );
}
