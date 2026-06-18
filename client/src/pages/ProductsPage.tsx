import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string | null;
  createdAt: string;
  orderedQuantity: number;
  stockBeforePurchases: number;
  _count: { orderItems: number };
}

interface ProductForm {
  name: string;
  price: string;
  stock: string;
  category: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  price: "",
  stock: "",
  category: "",
};

const PER_PAGE = 8;

function toCents(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 100);
}

function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [page, setPage] = useState(1);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const stockFilter = searchParams.get("stock") === "low" ? "low" : "all";

  async function loadProducts() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ products: Product[] }>("/products");
      setProducts(data.products);
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(data.products.length / PER_PAGE)))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [stockFilter]);

  function updateForm(field: keyof ProductForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      price: fromCents(product.price),
      stock: String(product.stock),
      category: product.category ?? "",
    });
    setFormError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const price = toCents(form.price);
    const stock = Number(form.stock);
    if (!Number.isFinite(price) || price < 0) {
      setFormError("Prix invalide");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setFormError("Stock invalide");
      return;
    }

    const body = {
      name: form.name,
      price,
      stock,
      category: form.category || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await api(`/products/${editingId}`, { method: "PATCH", body });
      } else {
        await api("/products", { method: "POST", body });
      }
      resetForm();
      await loadProducts();
      window.dispatchEvent(new Event("admin-notifications:refresh"));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProduct(product: Product) {
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      if (editingId === product.id) resetForm();
      setProductToDelete(null);
      await loadProducts();
      window.dispatchEvent(new Event("admin-notifications:refresh"));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    }
  }

  const totalOrdered = products.reduce(
    (total, product) => total + product.orderedQuantity,
    0
  );
  const totalCurrentStock = products.reduce(
    (total, product) => total + product.stock,
    0
  );
  const totalBeforePurchases = products.reduce(
    (total, product) => total + product.stockBeforePurchases,
    0
  );
  const visibleProducts =
    stockFilter === "low"
      ? products.filter((product) => product.stock <= 10)
      : products;
  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PER_PAGE;
  const pageProducts = visibleProducts.slice(start, start + PER_PAGE);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Produits</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ajoute, modifie et gere le stock de ta boutique.
        </p>
      </div>

      {stockFilter === "low" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">
            Filtre actif : produits en stock faible
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          >
            Voir tous les produits
          </button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
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
            Stock avant achat
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalBeforePurchases}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            {editingId ? "Modifier le produit" : "Ajouter un produit"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              required
              placeholder="Nom du produit"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => updateForm("price", e.target.value)}
              required
              placeholder="Prix en euros"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => updateForm("stock", e.target.value)}
              required
              placeholder="Stock"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <input
              value={form.category}
              onChange={(e) => updateForm("category", e.target.value)}
              placeholder="Categorie"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting
                  ? "Enregistrement..."
                  : editingId
                    ? "Enregistrer"
                    : "Ajouter"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {loading ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">
              Chargement...
            </p>
          ) : error ? (
            <p className="px-6 py-8 text-center text-sm text-red-600">{error}</p>
          ) : visibleProducts.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">
              Aucun produit pour l'instant.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Produit</th>
                  <th className="px-6 py-3 font-medium">Categorie</th>
                  <th className="px-6 py-3 font-medium">Prix</th>
                  <th className="px-6 py-3 font-medium">Stock</th>
                  <th className="px-6 py-3 font-medium">Avant achat</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {product.category || "-"}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {formatPrice(product.price)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          product.stock <= 5
                            ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            : product.stock <= 10
                              ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                              : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        }
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {product.stockBeforePurchases}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => editProduct(product)}
                          className="text-xs font-medium text-indigo-600 transition hover:text-indigo-800"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductToDelete(product)}
                          disabled={product._count.orderItems > 0}
                          title={
                            product._count.orderItems > 0
                              ? "Produit utilise dans des commandes"
                              : "Supprimer"
                          }
                          className="text-xs font-medium text-red-600 transition hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-sm text-slate-500">
            Page {currentPage} sur {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Precedent
          </button>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={currentPage === totalPages}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}

      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Supprimer le produit ?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Tu vas supprimer {productToDelete.name}. Cette action est definitive.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteProduct(productToDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
