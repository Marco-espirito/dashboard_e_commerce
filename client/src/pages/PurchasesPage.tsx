import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";

interface PurchaseSummary {
  id: string;
  name: string;
  category: string | null;
  currentStock: number;
  orderedQuantity: number;
  stockBeforePurchases: number;
  unitPrice: number;
  revenue: number;
}

export function PurchasesPage() {
  const [summary, setSummary] = useState<PurchaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ summary: PurchaseSummary[] }>("/purchases/summary")
      .then((data) => setSummary(data.summary))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, []);

  const totalOrdered = summary.reduce(
    (total, product) => total + product.orderedQuantity,
    0
  );
  const totalRevenue = summary.reduce(
    (total, product) => total + product.revenue,
    0
  );
  const totalCurrentStock = summary.reduce(
    (total, product) => total + product.currentStock,
    0
  );
  const totalBeforePurchases = summary.reduce(
    (total, product) => total + product.stockBeforePurchases,
    0
  );

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Achats</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vue des quantites achetees et du stock estime avant les commandes.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Articles achetes
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalOrdered}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Stock actuel
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalCurrentStock}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Stock avant achats
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalBeforePurchases}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            CA genere
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {formatPrice(totalRevenue)}
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Total par produit
          </h2>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">
            Chargement...
          </p>
        ) : error ? (
          <p className="px-6 py-8 text-center text-sm text-red-600">{error}</p>
        ) : summary.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">
            Aucun produit trouve.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Produit</th>
                <th className="px-6 py-3 font-medium">Categorie</th>
                <th className="px-6 py-3 font-medium">Prix unitaire</th>
                <th className="px-6 py-3 font-medium">Achetes</th>
                <th className="px-6 py-3 font-medium">Stock actuel</th>
                <th className="px-6 py-3 font-medium">Avant achats</th>
                <th className="px-6 py-3 font-medium">CA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((product) => (
                <tr key={product.id}>
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {product.name}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {product.category || "-"}
                  </td>
                  <td className="px-6 py-3 text-slate-700">
                    {formatPrice(product.unitPrice)}
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {product.orderedQuantity}
                  </td>
                  <td className="px-6 py-3 text-slate-700">
                    {product.currentStock}
                  </td>
                  <td className="px-6 py-3 text-slate-700">
                    {product.stockBeforePurchases}
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {formatPrice(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
