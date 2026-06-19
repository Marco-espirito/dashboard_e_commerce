import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "../lib/format";
import {
  queryKeys,
  fetchInventory,
  fetchMovements,
  createMovement,
  type StockStatus,
  type StockMovementType,
} from "../lib/queries";

const STATUS_META: Record<StockStatus, { label: string; cls: string }> = {
  OK: { label: "OK", cls: "bg-emerald-50 text-emerald-700" },
  LOW: { label: "Faible", cls: "bg-amber-50 text-amber-700" },
  CRITICAL: { label: "Critique", cls: "bg-red-50 text-red-700" },
};

const MOVEMENT_META: Record<StockMovementType, { label: string; cls: string }> = {
  STOCK_ADDED: { label: "Ajout de stock", cls: "bg-emerald-50 text-emerald-700" },
  STOCK_REMOVED: { label: "Retrait de stock", cls: "bg-orange-50 text-orange-700" },
  SALE: { label: "Vente", cls: "bg-indigo-50 text-indigo-700" },
  RETURN: { label: "Retour produit", cls: "bg-blue-50 text-blue-700" },
  MANUAL_CORRECTION: { label: "Correction manuelle", cls: "bg-slate-100 text-slate-600" },
};

// Types créables manuellement (la vente vient des commandes)
const FORM_TYPES: { value: Exclude<StockMovementType, "SALE">; label: string }[] = [
  { value: "STOCK_ADDED", label: "Ajout de stock" },
  { value: "STOCK_REMOVED", label: "Retrait de stock" },
  { value: "RETURN", label: "Retour produit" },
  { value: "MANUAL_CORRECTION", label: "Correction manuelle" },
];

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<"" | StockMovementType>("");

  const { data: inv, isLoading } = useQuery({
    queryKey: queryKeys.inventory(),
    queryFn: fetchInventory,
  });

  const { data: movementsData } = useQuery({
    queryKey: queryKeys.movements(typeFilter),
    queryFn: () => fetchMovements(typeFilter ? { type: typeFilter } : {}),
  });

  const items = inv?.items ?? [];
  const totals = inv?.totals;
  const movements = movementsData?.movements ?? [];

  // ── Formulaire d'ajout de mouvement ──
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<Exclude<StockMovementType, "SALE">>("STOCK_ADDED");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createMovement({ productId, type, quantity: Number(quantity), reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: ["inventory", "movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
      setQuantity(""); setReason(""); setFormError("");
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Erreur"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!productId) { setFormError("Sélectionne un produit."); return; }
    if (!quantity || Number(quantity) === 0) { setFormError("Quantité invalide."); return; }
    mutation.mutate();
  }

  if (isLoading || !totals) return <p className="text-sm text-slate-400">Chargement…</p>;

  const cards = [
    { label: "Produits", value: totals.totalProducts.toString() },
    { label: "Stock total actuel", value: totals.totalStock.toLocaleString("fr-FR") },
    { label: "Articles vendus", value: totals.totalSold.toLocaleString("fr-FR") },
    { label: "Valeur du stock", value: formatPrice(totals.totalStockValue) },
    { label: "Valeur avant ventes", value: formatPrice(totals.estimatedValueBeforeSales) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inventaire</h1>
        <p className="mt-1 text-sm text-slate-500">
          État du stock, valorisation et historique des mouvements.
        </p>
      </div>

      {/* Cartes récap */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.label}</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tableau inventaire */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Produit</th>
              <th className="px-5 py-3 font-medium">Catégorie</th>
              <th className="px-5 py-3 font-medium text-right">Stock</th>
              <th className="px-5 py-3 font-medium text-right">Avant achat</th>
              <th className="px-5 py-3 font-medium text-right">Vendus</th>
              <th className="px-5 py-3 font-medium text-right">Prix unit.</th>
              <th className="px-5 py-3 font-medium text-right">Valeur stock</th>
              <th className="px-5 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{it.name}</td>
                <td className="px-5 py-3 text-slate-500">{it.category ?? "—"}</td>
                <td className="px-5 py-3 text-right text-slate-700">{it.stock}</td>
                <td className="px-5 py-3 text-right text-slate-500">{it.stockBefore}</td>
                <td className="px-5 py-3 text-right text-slate-500">{it.sold}</td>
                <td className="px-5 py-3 text-right text-slate-700">{formatPrice(it.unitPrice)}</td>
                <td className="px-5 py-3 text-right font-medium text-slate-900">{formatPrice(it.stockValue)}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[it.status].cls}`}>
                    {STATUS_META[it.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td className="px-5 py-3 text-sm font-semibold text-slate-700" colSpan={6}>
                Valeur totale du stock
              </td>
              <td className="px-5 py-3 text-right text-base font-semibold text-slate-900">
                {formatPrice(totals.totalStockValue)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mouvements de stock */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Formulaire */}
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Nouveau mouvement</h2>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Choisir un produit…</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.name} (stock {it.stock})</option>
              ))}
            </select>

            <select
              value={type}
              onChange={(e) => setType(e.target.value as Exclude<StockMovementType, "SALE">)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {FORM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={type === "MANUAL_CORRECTION" ? "Quantité (+ ou −)" : "Quantité"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />

            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif (optionnel)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {mutation.isPending ? "Enregistrement…" : "Enregistrer le mouvement"}
            </button>
          </form>
        </section>

        {/* Historique */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Mouvements de stock</h2>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "" | StockMovementType)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tous les types</option>
              {Object.entries(MOVEMENT_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </div>

          {movements.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">Aucun mouvement.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Produit</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium text-right">Quantité</th>
                  <th className="px-6 py-3 font-medium">Motif</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3 font-medium text-slate-900">{m.product.name}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MOVEMENT_META[m.type].cls}`}>
                        {MOVEMENT_META[m.type].label}
                      </span>
                    </td>
                    <td className={`px-6 py-3 text-right font-medium ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{m.reason ?? "—"}</td>
                    <td className="px-6 py-3 text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
