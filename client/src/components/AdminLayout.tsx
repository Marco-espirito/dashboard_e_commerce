import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { queryKeys, fetchNotifications } from "../lib/queries";

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });

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
          <NavLink to="/admin/sessions" className={linkClass}>
            Sessions
          </NavLink>
          <NavLink to="/admin/securite" className={linkClass}>
            Sécurité
          </NavLink>
        </nav>

        {notifications && notificationCount > 0 && (
          <div className="relative mt-4">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-left transition hover:bg-amber-100"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-amber-700">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                    {notificationCount}
                  </span>
                </span>
                Notifications
              </span>
              <span className="text-xs font-semibold text-amber-700">
                {notificationsOpen ? "Masquer" : "Voir"}
              </span>
            </button>

            {notificationsOpen && (
              <div className="mt-2 space-y-2 rounded-xl border border-amber-100 bg-white p-2 text-xs shadow-sm">
                {notifications.counts.pendingOrders > 0 && (
                  <NavLink to="/admin/commandes?status=PENDING" onClick={() => setNotificationsOpen(false)}
                    className="block rounded-lg px-2 py-1.5 text-amber-800 transition hover:bg-amber-50">
                    {notifications.counts.pendingOrders} commande{notifications.counts.pendingOrders > 1 ? "s" : ""} en attente
                  </NavLink>
                )}
                {notifications.counts.cancelledOrders > 0 && (
                  <NavLink to="/admin/commandes?status=CANCELLED" onClick={() => setNotificationsOpen(false)}
                    className="block rounded-lg px-2 py-1.5 text-red-700 transition hover:bg-red-50">
                    {notifications.counts.cancelledOrders} commande{notifications.counts.cancelledOrders > 1 ? "s" : ""} annulee{notifications.counts.cancelledOrders > 1 ? "s" : ""}
                  </NavLink>
                )}
                {notifications.counts.lowStockProducts > 0 && (
                  <NavLink to="/admin/produits?stock=low" onClick={() => setNotificationsOpen(false)}
                    className="block rounded-lg px-2 py-1.5 text-slate-700 transition hover:bg-slate-50">
                    {notifications.counts.lowStockProducts} produit{notifications.counts.lowStockProducts > 1 ? "s" : ""} en stock faible
                  </NavLink>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="px-2 text-sm font-medium text-slate-900">{user?.name}</div>
          <div className="px-2 text-xs text-slate-400">Administrateur</div>
          <button onClick={handleLogout}
            className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
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
            <NavLink to="/admin/sessions" className={linkClass}>Sessions</NavLink>
            <NavLink to="/admin/securite" className={linkClass}>Sécurité</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            {notifications && notificationCount > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setNotificationsOpen((open) => !open)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                    {notificationCount}
                  </span>
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 top-11 z-20 w-56 space-y-2 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
                    {notifications.counts.pendingOrders > 0 && (
                      <NavLink to="/admin/commandes?status=PENDING" onClick={() => setNotificationsOpen(false)}
                        className="block rounded-lg px-2 py-1.5 text-amber-800 transition hover:bg-amber-50">
                        {notifications.counts.pendingOrders} commandes en attente
                      </NavLink>
                    )}
                    {notifications.counts.cancelledOrders > 0 && (
                      <NavLink to="/admin/commandes?status=CANCELLED" onClick={() => setNotificationsOpen(false)}
                        className="block rounded-lg px-2 py-1.5 text-red-700 transition hover:bg-red-50">
                        {notifications.counts.cancelledOrders} commandes annulees
                      </NavLink>
                    )}
                    {notifications.counts.lowStockProducts > 0 && (
                      <NavLink to="/admin/produits?stock=low" onClick={() => setNotificationsOpen(false)}
                        className="block rounded-lg px-2 py-1.5 text-slate-700 transition hover:bg-slate-50">
                        {notifications.counts.lowStockProducts} produits en stock faible
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
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
