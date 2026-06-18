import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";

type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
type SortOption = "DATE_DESC" | "DATE_ASC" | "TOTAL_DESC" | "TOTAL_ASC";

interface Order {
  id: string;
  customer: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  _count: { items: number };
}

interface OrderDetail {
  id: string;
  customer: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    product: {
      id: string;
      name: string;
      category: string | null;
    };
  }[];
}

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("DATE_DESC");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    api<{ orders: Order[] }>("/orders")
      .then((data) => setOrders(data.orders))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, []);


  const filtered =
    filter === "ALL" ? orders : orders.filter((o) => o.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "DATE_ASC") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sort === "TOTAL_DESC") return b.total - a.total;
    if (sort === "TOTAL_ASC") return a.total - b.total;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Découpage en pages
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages); // évite de rester sur une page vide
  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = sorted.slice(start, start + PER_PAGE);
  const firstPageOrderId = pageItems[0]?.id ?? null;

  // Quand on change de filtre, on revient à la page 1
  function changeFilter(value: "ALL" | OrderStatus) {
    setFilter(value);
    setPage(1);
  }

  async function changeStatus(id: string, status: OrderStatus) {
    setError("");
    setUpdatingId(id);
    try {
      const data = await api<{ order: { id: string; status: OrderStatus } }>(
        `/orders/${id}/status`,
        { method: "PATCH", body: { status } }
      );
      setOrders((current) =>
        current.map((order) =>
          order.id === data.order.id
            ? { ...order, status: data.order.status }
            : order
        )
      );
      setOrderDetail((current) =>
        current?.id === data.order.id
          ? { ...current, status: data.order.status }
          : current
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUpdatingId(null);
    }
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
  }, [loading, error, firstPageOrderId, currentPage, filter, sort]);

  if (loading) return <p className="text-sm text-slate-400">Chargement...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Commandes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} commande{filtered.length > 1 ? "s" : ""}
            {filter !== "ALL" ? " dans cette catégorie" : " au total"}.
          </p>
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
            onChange={(e) => {
              setSort(e.target.value as SortOption);
              setPage(1);
            }}
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
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                  Aucune commande dans cette catégorie.
                </td>
              </tr>
            ) : (
              pageItems.map((o) => (
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
                      disabled={updatingId === o.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        changeStatus(o.id, e.target.value as OrderStatus)
                      }
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
              <h2 className="text-sm font-semibold text-slate-900">
                Detail de la commande
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Clique sur une ligne pour afficher les articles.
              </p>
            </div>
            {orderDetail && (
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderId(null);
                  setOrderDetail(null);
                  setDetailError("");
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                Fermer
              </button>
            )}
          </div>

          {detailLoading ? (
            <p className="mt-6 text-sm text-slate-400">Chargement...</p>
          ) : detailError ? (
            <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {detailError}
            </p>
          ) : orderDetail ? (
            <div className="mt-6 space-y-5">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Client</span>
                  <span className="font-medium text-slate-900">
                    {orderDetail.customer}
                  </span>
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Articles achetes
                </h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {orderDetail.items.map((item) => (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {item.product.name}
                          </div>
                          {item.product.category && (
                            <div className="mt-0.5 text-xs text-slate-400">
                              {item.product.category}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-medium text-slate-900">
                            {formatPrice(item.quantity * item.unitPrice)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {item.quantity} x {formatPrice(item.unitPrice)}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500">Total</span>
                <span className="text-lg font-semibold text-slate-900">
                  {formatPrice(orderDetail.total)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              Aucune commande selectionnee.
            </div>
          )}
        </aside>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            Page {currentPage} sur {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
