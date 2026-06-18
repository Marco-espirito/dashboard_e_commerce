import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

interface AdminNotifications {
  counts: {
    pendingOrders: number;
    cancelledOrders: number;
    lowStockProducts: number;
    total: number;
  };
  pendingOrders: { id: string; customer: string }[];
  cancelledOrders: { id: string; customer: string }[];
  lowStockProducts: { id: string; name: string; stock: number }[];
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AdminNotifications | null>(
    null
  );

  useEffect(() => {
    api<AdminNotifications>("/notifications")
      .then(setNotifications)
      .catch(() => setNotifications(null));
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "rounded-lg px-3 py-2 text-sm font-medium transition",
      isActive
        ? "bg-indigo-50 text-indigo-700"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");
  const notificationCount = notifications?.counts.total ?? 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            E
          </span>
          <span className="text-sm font-semibold text-slate-900">E-Shop Admin</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavLink to="/admin" end className={linkClass}>
            Tableau de bord
          </NavLink>
           <NavLink to="/admin/commandes" className={linkClass}>
            Commandes
          </NavLink>
          <NavLink to="/admin/produits" className={linkClass}>
            Produits
          </NavLink>
          <NavLink to="/admin/equipe" className={linkClass}>
            Équipe
          </NavLink>
        </nav>

        {notifications && notificationCount > 0 && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Notifications
              </div>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {notificationCount}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {notifications.counts.pendingOrders > 0 && (
                <NavLink
                  to="/admin/commandes"
                  className="block rounded-lg bg-white/70 px-2 py-1.5 text-amber-800 transition hover:bg-white"
                >
                  {notifications.counts.pendingOrders} commande
                  {notifications.counts.pendingOrders > 1 ? "s" : ""} en attente
                </NavLink>
              )}
              {notifications.counts.cancelledOrders > 0 && (
                <NavLink
                  to="/admin/commandes"
                  className="block rounded-lg bg-white/70 px-2 py-1.5 text-red-700 transition hover:bg-white"
                >
                  {notifications.counts.cancelledOrders} commande
                  {notifications.counts.cancelledOrders > 1 ? "s" : ""} annulee
                  {notifications.counts.cancelledOrders > 1 ? "s" : ""}
                </NavLink>
              )}
              {notifications.counts.lowStockProducts > 0 && (
                <NavLink
                  to="/admin/produits"
                  className="block rounded-lg bg-white/70 px-2 py-1.5 text-slate-700 transition hover:bg-white"
                >
                  {notifications.counts.lowStockProducts} produit
                  {notifications.counts.lowStockProducts > 1 ? "s" : ""} en stock faible
                </NavLink>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="px-2 text-sm font-medium text-slate-900">{user?.name}</div>
          <div className="px-2 text-xs text-slate-400">Administrateur</div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex gap-1">
            <NavLink to="/admin" end className={linkClass}>Dashboard</NavLink>
            <NavLink to="/admin/commandes" className={linkClass}>Commandes</NavLink>
            <NavLink to="/admin/produits" className={linkClass}>Produits</NavLink>
            <NavLink to="/admin/equipe" className={linkClass}>Équipe</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            {notificationCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                {notificationCount} alertes
              </span>
            )}
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
              Deconnexion
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
