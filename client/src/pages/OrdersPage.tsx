import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";
import { queryKeys, fetchOrders } from "../lib/queries";
import type { OrderStatus, SortOption, OrderDetail } from "../lib/queries";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "En attente", PAID: "Payée", SHIPPED: "Expédiée",
  DELIVERED: "Livrée", CANCELLED: "Annulée",
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-indigo-50 text-indigo-700",
  SHIPPED: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "PENDING", label: STATUS_LABELS.PENDING },
  { value: "PAID", label: STATUS_LABELS.PAID },
  { value: "SHIPPED", label: STATUS_LABELS.SHIPPED },
  { value: "DELIVERED", label: STATUS_LABELS.DELIVERED },
  { value: "CANCELLED", label: STATUS_LABELS.CANCELLED },
];

const ORDER_STATUSES: OrderStatus[] = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"];

function isOrderStatus(value: string | null): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

const FILTERS: { value: "ALL" | OrderStatus; label: string }[] = [
  { value: "ALL", label: "Toutes" },
  { value: "PAID", label: "Payées" },
  { value: "PENDING", label: "En attente" },
  { value: "SHIPPED", label: "Expédiées" },
  { value: "DELIVERED", label: "Livrées" },
  { value: "CANCELLED", label: "Annulées" },
];

const PER_PAGE = 10;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "DATE_DESC", label: "Date recente" },
  { value: "DATE_ASC", label: "Date ancienne" },
  { value: "TOTAL_DESC", label: "Montant eleve" },
  { value: "TOTAL_ASC", label: "Montant faible" },
];

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const statusParam = searchParams.get("status");
  const filter: "ALL" | OrderStatus = isOrderStatus(statusParam) ? statusParam : "ALL";
  const sort = (searchParams.get("sort") as SortOption) ?? "DATE_DESC";
  const currentPage = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const customer = searchParams.get("customer") ?? undefined;

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  function setParams(updates: Record<string, string | null>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) next.delete(k); else next.set(k, v);
      }
      return next;
    });
  }

  const ordersParams = {
    page: currentPage,
    limit: PER_PAGE,
    sort,
    ...(filter !== "ALL" ? { status: filter } : {}),
    ...(customer ? { customer } : {}),
  };

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.orders(ordersParams),
    queryFn: () => fetchOrders(ordersParams),
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const firstPageOrderId = orders[0]?.id ?? null;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api<{ order: { id: string; status: OrderStatus } }>(`/orders/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
      setOrderDetail((current) =>
        current?.id === result.order.id ? { ...current, status: result.order.status } : current
      );
      if (selectedOrderId === result.order.id) {
        loadOrderDetail(result.order.id);
      }
    },
  });

  function changeFilter(value: "ALL" | OrderStatus) {
    setParams({ status: value === "ALL" ? null : value, page: null });
  }

  async function loadOrderDetail(id: string) {
    setSelectedOrderId(id);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await api<{ order: OrderDetail }>(`/orders/${id}`);
      setOrderDetail(data.order);
    } catch (e) {
      setOrderDetail(null);
      setDetailError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (loading || error) return;
    if (!firstPageOrderId) {
      setSelectedOrderId(null);
      setOrderDetail(null);
      setDetailError("");
      return;
    }
    if (selectedOrderId !== firstPageOrderId) {
      loadOrderDetail(firstPageOrderId);
    }
  }, [loading, !!error, firstPageOrderId, currentPage, filter, sort, customer]);

  if (loading) return <p className="text-sm text-slate-400">Chargement...</p>;
  if (error) return <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Erreur"}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Commandes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} commande{total > 1 ? "s" : ""}
            {filter !== "ALL" ? " dans cette catégorie" : " au total"}.
          </p>
          {customer && (
            <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
              Client : {customer}
              <button
                type="button"
                onClick={() => setParams({ customer: null, page: null })}
                className="text-indigo-400 transition hover:text-indigo-700"
                aria-label="Retirer le filtre client"
              >
                ✕
              </button>
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => changeFilter(f.value)}
              className={
                filter === f.value
                  ? "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              }
            >
              {f.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value, page: null })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Trier : {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Client</th>
              <th className="px-6 py-3 font-medium">Articles</th>
              <th className="px-6 py-3 font-medium">Montant</th>
              <th className="px-6 py-3 font-medium">Statut</th>
              <th className="px-6 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                  Aucune commande dans cette catégorie.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => loadOrderDetail(o.id)}
                  className={
                    selectedOrderId === o.id
                      ? "cursor-pointer bg-indigo-50/60"
                      : "cursor-pointer transition hover:bg-slate-50"
                  }
                >
                  <td className="px-6 py-3 font-medium text-slate-900">{o.customer}</td>
                  <td className="px-6 py-3 text-slate-500">{o._count.items}</td>
                  <td className="px-6 py-3 text-slate-700">{formatPrice(o.total)}</td>
                  <td className="px-6 py-3">
                    <select
                      value={o.status}
                      disabled={statusMutation.isPending}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => statusMutation.mutate({ id: o.id, status: e.target.value as OrderStatus })}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium outline-none transition focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${STATUS_CLASSES[o.status]}`}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Detail de la commande</h2>
              <p className="mt-1 text-xs text-slate-400">Clique sur une ligne pour afficher les articles.</p>
            </div>
            {orderDetail && (
              <button
                type="button"
                onClick={() => { setSelectedOrderId(null); setOrderDetail(null); setDetailError(""); }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                Fermer
              </button>
            )}
          </div>

          {detailLoading ? (
            <p className="mt-6 text-sm text-slate-400">Chargement...</p>
          ) : detailError ? (
            <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{detailError}</p>
          ) : orderDetail ? (
            <div className="mt-6 space-y-5">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Client</span>
                  <span className="font-medium text-slate-900">{orderDetail.customer}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-900">
                    {new Date(orderDetail.createdAt).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Statut</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[orderDetail.status]}`}>
                    {STATUS_LABELS[orderDetail.status]}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Articles achetes</h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {orderDetail.items.map((item) => (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{item.product.name}</div>
                          {item.product.category && (
                            <div className="mt-0.5 text-xs text-slate-400">{item.product.category}</div>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-medium text-slate-900">{formatPrice(item.quantity * item.unitPrice)}</div>
                          <div className="text-xs text-slate-400">{item.quantity} x {formatPrice(item.unitPrice)}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Historique des statuts</h3>
                {orderDetail.statusHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">Aucun changement de statut enregistre.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {orderDetail.statusHistory.map((entry) => (
                      <li key={entry.id} className="rounded-xl bg-slate-50 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_CLASSES[entry.fromStatus]}`}>
                            {STATUS_LABELS[entry.fromStatus]}
                          </span>
                          <span className="text-slate-400">vers</span>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_CLASSES[entry.toStatus]}`}>
                            {STATUS_LABELS[entry.toStatus]}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Par {entry.changedBy.name} le {new Date(entry.createdAt).toLocaleString("fr-FR")}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500">Total</span>
                <span className="text-lg font-semibold text-slate-900">{formatPrice(orderDetail.total)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              Aucune commande selectionnee.
            </div>
          )}
        </aside>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">Page {currentPage} sur {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setParams({ page: String(currentPage - 1) })}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              onClick={() => setParams({ page: String(currentPage + 1) })}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
