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

const MAIN_NAV = ["Vetements", "Chaussures", "Accessoires", "Maison", "Papeterie", "Petits prix"];

const MEGA_LINKS = [
  {
    title: "Femme",
    links: ["Tout voir", "Nouveautes", "Bijoux", "Chapeaux & bonnets", "Sacs a main"],
  },
  {
    title: "Homme",
    links: ["Tout voir", "Nouveautes", "Casquettes", "Montres", "Sacs & valises"],
  },
  {
    title: "Enfant",
    links: ["Tout voir", "Nouveautes", "Accessoires ecole", "Jouets", "Sacs & cartables"],
  },
];

const HERO_SLIDES = [
  {
    kicker: "Selection ete",
    title: "Des essentiels faciles a porter, faciles a commander.",
    text: "Un look plus doux, des categories claires, et un panier connecte a ton back-office.",
    tone: "hero-sand",
  },
  {
    kicker: "Accessoires",
    title: "Sacs, carnets, objets utiles : tout est a portee de clic.",
    text: "Clique sur Accessoires pour ouvrir une navigation detaillee inspiree des grands sites mode.",
    tone: "hero-sky",
  },
  {
    kicker: "Stock en direct",
    title: "Chaque vente met l'inventaire a jour automatiquement.",
    text: "Les commandes partent en attente dans l'admin et les mouvements de stock sont traces.",
    tone: "hero-mint",
  },
];

function visualClass(product: Product) {
  const category = product.category?.toLowerCase() ?? "";
  if (category.includes("vetement") || category.includes("vêtement")) return "visual visual-clothes";
  if (category.includes("maison")) return "visual visual-home";
  if (category.includes("accessoire")) return "visual visual-accessory";
  if (category.includes("papeterie")) return "visual visual-paper";
  return "visual visual-default";
}

function matchesCategory(product: Product, name: string) {
  return product.category?.toLowerCase().includes(name.toLowerCase()) ?? false;
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
  const [activeMega, setActiveMega] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

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
  const hero = HERO_SLIDES[heroIndex];

  const newestProducts = products.slice(0, 10);
  const accessoryProducts = products.filter((product) => matchesCategory(product, "accessoire"));
  const lowPriceProducts = [...products].sort((a, b) => a.price - b.price).slice(0, 10);

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

  function chooseNav(label: string) {
    setActiveMega((current) => (current === label ? null : label));
    if (label === "Petits prix") {
      setSort("PRICE_ASC");
      setCategory("");
      return;
    }
    const matchingCategory = categories.find((c) => c.toLowerCase() === label.toLowerCase());
    if (matchingCategory) {
      setCategory(matchingCategory);
    }
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
      setCheckoutMessage(`Commande ${res.order.id.slice(-6).toUpperCase()} envoyee dans l'admin.`);
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
      <div className="benefits">
        <span>Essayez d'abord, payez apres</span>
        <span>Livraison offerte des 34 EUR</span>
        <span>Retours sous 30 jours</span>
        <span>Cartes cadeaux</span>
      </div>

      <header className="topbar">
        <div className="audiences">
          <button>Femme</button>
          <button>Homme</button>
          <button>Enfant</button>
        </div>

        <div className="brand">E-Shop</div>

        <div className="header-actions">
          <a className="admin-link" href="http://localhost:5173/admin">Admin</a>
          <button className="bag-button">Panier {itemsCount}</button>
        </div>
      </header>

      <div className="nav-area" onMouseLeave={() => setActiveMega(null)}>
      <nav className="category-nav">
        {MAIN_NAV.map((label) => (
          <button
            key={label}
            onMouseEnter={() => setActiveMega(label === "Accessoires" ? label : null)}
            onFocus={() => setActiveMega(label === "Accessoires" ? label : null)}
            onClick={() => chooseNav(label)}
            className={activeMega === label || category.toLowerCase() === label.toLowerCase() ? "active" : ""}
          >
            {label}
          </button>
        ))}
        <div className="nav-search">
          <span>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" />
        </div>
      </nav>

        <section className={activeMega === "Accessoires" ? "mega-menu open" : "mega-menu"}>
          <div className="mega-columns">
            {MEGA_LINKS.map((group) => (
              <div key={group.title}>
                <h3>{group.title}</h3>
                {group.links.map((link) => (
                  <button
                    key={link}
                    onClick={() => {
                      const matchingCategory = categories.find((c) =>
                        c.toLowerCase().includes("accessoire")
                      );
                      if (matchingCategory) setCategory(matchingCategory);
                      setActiveMega(null);
                    }}
                  >
                    <span className="link-icon">◇</span>
                    {link}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mega-feature">
            <div className="mini-photo">Accessoires</div>
            <p>Une selection douce pour completer chaque commande.</p>
          </div>
        </section>
      </div>

      <main className="layout">
        <section className="content">
          <section className={`hero ${hero.tone}`}>
            <button
              className="hero-arrow"
              onClick={() => setHeroIndex((current) => (current + HERO_SLIDES.length - 1) % HERO_SLIDES.length)}
            >
              ←
            </button>
            <div key={`visual-${heroIndex}`} className="hero-visual hero-fade">
              <span className="sun" />
              <span className="shape shape-one" />
              <span className="shape shape-two" />
              <span className="shape shape-three" />
            </div>
            <div key={`copy-${heroIndex}`} className="hero-copy hero-fade">
              <p className="eyebrow">{hero.kicker}</p>
              <h1>{hero.title}</h1>
              <p>{hero.text}</p>
              <div className="hero-buttons">
                <button onClick={() => setCategory("")}>Tout voir</button>
                <button onClick={() => chooseNav("Accessoires")}>Accessoires</button>
                <button onClick={() => setSort("PRICE_ASC")}>Petits prix</button>
              </div>
            </div>
            <button
              className="hero-arrow"
              onClick={() => setHeroIndex((current) => (current + 1) % HERO_SLIDES.length)}
            >
              →
            </button>
            <div className="dots">
              {HERO_SLIDES.map((slide, index) => (
                <button
                  key={slide.title}
                  aria-label={`Slide ${index + 1}`}
                  onClick={() => setHeroIndex(index)}
                  className={index === heroIndex ? "active" : ""}
                />
              ))}
            </div>
          </section>

          <section className="filters">
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
            <>
              <ProductCarousel title="Nouveautes" products={newestProducts} onAdd={addToCart} />
              <ProductCarousel
                title="Accessoires a decouvrir"
                products={accessoryProducts.length > 0 ? accessoryProducts : newestProducts}
                onAdd={addToCart}
              />
              <ProductCarousel title="Petits prix" products={lowPriceProducts} onAdd={addToCart} />

              <section className="section-head">
                <div>
                  <p className="eyebrow dark">Catalogue</p>
                  <h2>{category || "Tous les produits"}</h2>
                </div>
                <span>{products.length} resultat{products.length > 1 ? "s" : ""}</span>
              </section>

              <section className="grid">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} onAdd={addToCart} />
                ))}
              </section>
            </>
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

function ProductCarousel({
  title,
  products,
  onAdd,
}: {
  title: string;
  products: Product[];
  onAdd: (product: Product) => void;
}) {
  if (products.length === 0) return null;

  return (
    <section className="carousel-section">
      <div className="section-head compact">
        <h2>{title}</h2>
        <span>Faire defiler →</span>
      </div>
      <div className="carousel">
        {products.map((product) => (
          <ProductCard key={`${title}-${product.id}`} product={product} onAdd={onAdd} compact />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  onAdd,
  compact = false,
}: {
  product: Product;
  onAdd: (product: Product) => void;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "product-card compact-card" : "product-card"}>
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
        <button onClick={() => onAdd(product)}>Ajouter</button>
      </div>
    </article>
  );
}
