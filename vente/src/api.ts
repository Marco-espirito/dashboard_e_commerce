import type { Product, SortOption } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Une erreur est survenue");
  }
  return data as T;
}

export function fetchProducts(params: { q: string; category: string; sort: SortOption }) {
  const search = new URLSearchParams({ sort: params.sort });
  if (params.q.trim()) search.set("q", params.q.trim());
  if (params.category) search.set("category", params.category);
  return request<{ products: Product[]; categories: string[] }>(`/shop/products?${search}`);
}

export function createOrder(body: {
  customer: string;
  items: { productId: string; quantity: number }[];
}) {
  return request<{ order: { id: string; total: number; status: string; createdAt: string } }>(
    "/shop/orders",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}
