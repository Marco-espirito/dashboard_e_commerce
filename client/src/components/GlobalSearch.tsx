import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { search, type SearchResults } from "../lib/queries";

const EMPTY: SearchResults = { products: [], orders: [], members: [], clients: [] };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce 300 ms pour ne pas requêter à chaque frappe.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  // Fermer le menu si clic en dehors.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => search(debounced),
    enabled: debounced.length >= 2,
  });

  const results = data ?? EMPTY;
  const totalResults =
    results.products.length + results.orders.length + results.members.length + results.clients.length;

  function go(path: string) {
    setOpen(false);
    setTerm("");
    setDebounced("");
    navigate(path);
  }

  function customerLink(name: string) {
    return `/admin/commandes?customer=${encodeURIComponent(name)}`;
  }

  const showDropdown = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {isFetching && totalResults === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Recherche…</p>
          ) : totalResults === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Aucun résultat</p>
          ) : (
            <div className="space-y-3">
              {results.products.length > 0 && (
                <Group title="Produits">
                  {results.products.map((p) => (
                    <Item
                      key={p.id}
                      label={p.name}
                      meta={`${p.category ?? "Sans catégorie"} · stock ${p.stock}`}
                      onClick={() => go("/admin/produits")}
                    />
                  ))}
                </Group>
              )}

              {results.clients.length > 0 && (
                <Group title="Clients">
                  {results.clients.map((c) => (
                    <Item
                      key={c.name}
                      label={c.name}
                      meta={`${c.ordersCount} commande${c.ordersCount > 1 ? "s" : ""}`}
                      onClick={() => go(customerLink(c.name))}
                    />
                  ))}
                </Group>
              )}

              {results.orders.length > 0 && (
                <Group title="Commandes">
                  {results.orders.map((o) => (
                    <Item
                      key={o.id}
                      label={o.customer}
                      meta={`${(o.total / 100).toLocaleString("fr-FR")} € · ${o.status}`}
                      onClick={() => go(customerLink(o.customer))}
                    />
                  ))}
                </Group>
              )}

              {results.members.length > 0 && (
                <Group title="Membres">
                  {results.members.map((m) => (
                    <Item
                      key={m.id}
                      label={m.name}
                      meta={`${m.email} · ${m.role === "ADMIN" ? "Admin" : "Membre"}`}
                      onClick={() => go("/admin/equipe")}
                    />
                  ))}
                </Group>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

function Item({ label, meta, onClick }: { label: string; meta: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100"
      >
        <span className="block truncate text-sm font-medium text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-400">{meta}</span>
      </button>
    </li>
  );
}
