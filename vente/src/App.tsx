import { useEffect, useMemo, useState } from "react";
import { createOrder, fetchProducts } from "./api";
import { formatPrice } from "./format";
import type { CartItem, Product, SortOption } from "./types";

const SORT_LABELS: { value: SortOption; label: string }[] = [
  { value: "NEWEST", label: "Nouveautes" },
  { value: "PRICE_ASC", label: "Prix croissant" },
  { value: "PRICE_DESC", label: "Prix decroissant" },
  { value: "NAME_ASC", label: "Nom A-Z" },
];

function visualClass(product: Product) {
  const category = product.category?.toLowerCase() ?? "";
  if (category.includes("vetement") || category.includes("vêtement")) return "visual visual-clothes";
  if (category.includes("maison")) return "visual visual-home";
  if (category.includes("accessoire")) return "visual visual-accessory";
  if (category.includes("papeterie")) return "visual visual-paper";
  return "visual visual-default";
}

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortOption>("NEWEST");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchProducts({ q, category, sort })
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setCategories(data.categories);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, category, sort]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  );
  const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: Product) {
    setCheckoutMessage("");
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      if (existing.quantity >= product.stock) return current;
      return current.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(1, Math.min(quantity, item.product.stock)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  async function checkout() {
    setCheckoutMessage("");
    if (cart.length === 0) {
      setCheckoutMessage("Ton panier est vide.");
      return;
    }
    if (customer.trim().length < 2) {
      setCheckoutMessage("Ajoute ton nom pour valider la commande.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createOrder({
        customer: customer.trim(),
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      });
      setCart([]);
      setCustomer("");
      setCheckoutMessage(`Commande ${res.order.id.slice(-6).toUpperCase()} envoyee. Elle apparait dans l'admin.`);
      const data = await fetchProducts({ q, category, sort });
      setProducts(data.products);
      setCategories(data.categories);
    } catch (err) {
      setCheckoutMessage(err instanceof Error ? err.message : "Erreur pendant la commande.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">E-Shop</div>
          <p>Mode, maison et essentiels du quotidien.</p>
        </div>
        <a className="admin-link" href="http://localhost:5173/admin">
          Admin
        </a>
      </header>

      <main className="layout">
        <section className="content">
          <section className="hero">
            <div>
              <p className="eyebrow">Nouvelle selection</p>
              <h1>Une boutique simple, rapide, connectee a ton back-office.</h1>
              <p>
                Les produits viennent directement de l'inventaire. Chaque commande reduit le stock
                et remonte dans l'administration.
              </p>
            </div>
          </section>

          <section className="filters">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un produit"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Toutes les categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
              {SORT_LABELS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </section>

          {loading ? (
            <p className="state">Chargement des produits...</p>
          ) : error ? (
            <p className="state error">{error}</p>
          ) : products.length === 0 ? (
            <p className="state">Aucun produit disponible.</p>
          ) : (
            <section className="grid">
              {products.map((product) => (
                <article key={product.id} className="product-card">
                  <div className={visualClass(product)}>
                    <span>{product.category || "Produit"}</span>
                  </div>
                  <div className="product-body">
                    <div>
                      <h2>{product.name}</h2>
                      <p>{product.category || "Selection"}</p>
                    </div>
                    <div className="product-meta">
                      <strong>{formatPrice(product.price)}</strong>
                      <span>{product.stock} en stock</span>
                    </div>
                    <button onClick={() => addToCart(product)}>Ajouter au panier</button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>

        <aside className="cart">
          <div className="cart-header">
            <div>
              <h2>Panier</h2>
              <p>{itemsCount} article{itemsCount > 1 ? "s" : ""}</p>
            </div>
            <strong>{formatPrice(total)}</strong>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <p className="empty">Ajoute un produit pour commencer.</p>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="cart-line">
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>{formatPrice(item.product.price)}</span>
                  </div>
                  <div className="qty">
                    <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                    <button className="remove" onClick={() => removeFromCart(item.product.id)}>Retirer</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="checkout">
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Nom du client"
            />
            <button onClick={checkout} disabled={submitting}>
              {submitting ? "Validation..." : "Valider la commande"}
            </button>
            {checkoutMessage && <p className="message">{checkoutMessage}</p>}
          </div>
        </aside>
      </main>
    </div>
  );
}
