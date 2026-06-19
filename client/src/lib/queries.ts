import { api } from "./api";

// ─── Query key factories ──────────────────────────────────────────────────────

export const queryKeys = {
  stats: () => ["stats", "overview"] as const,
  purchases: () => ["purchases", "summary"] as const,
  notifications: () => ["notifications"] as const,
  members: () => ["members"] as const,
  sessions: () => ["sessions"] as const,
  twoFactorStatus: () => ["2fa", "status"] as const,
  orders: (params: OrdersParams) => ["orders", params] as const,
  products: (params: ProductsParams) => ["products", params] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type SortOption = "DATE_DESC" | "DATE_ASC" | "TOTAL_DESC" | "TOTAL_ASC";

export interface OrdersParams {
  page: number;
  limit: number;
  status?: OrderStatus;
  sort: SortOption;
  customer?: string;
}

export interface ProductsParams {
  page: number;
  limit: number;
  stock: "all" | "low";
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

export function fetchStats() {
  return api<Stats>("/stats/overview");
}

export function fetchPurchases() {
  return api<{ summary: PurchaseSummary[] }>("/purchases/summary");
}

export function fetchNotifications() {
  return api<AdminNotifications>("/notifications");
}

export function fetchMembers() {
  return api<{ members: Member[] }>("/members");
}

export function fetchSessions() {
  return api<{ sessions: Session[] }>("/auth/sessions");
}

export function revokeSession(id: string) {
  return api<{ success: boolean }>(`/auth/sessions/${id}`, { method: "DELETE" });
}

export function revokeOtherSessions() {
  return api<{ success: boolean; revokedCount: number }>("/auth/sessions", {
    method: "DELETE",
  });
}

// ─── 2FA (TOTP) ────────────────────────────────────────────────────────────────

export function fetchTwoFactorStatus() {
  return api<{ enabled: boolean }>("/auth/2fa/status");
}

export function setupTwoFactor() {
  return api<{ qrCode: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" });
}

export function enableTwoFactor(code: string) {
  return api<{ success: boolean }>("/auth/2fa/enable", { method: "POST", body: { code } });
}

export function disableTwoFactor(code: string) {
  return api<{ success: boolean }>("/auth/2fa/disable", { method: "POST", body: { code } });
}

// ─── Recherche globale ──────────────────────────────────────────────────────────

export interface SearchResults {
  products: { id: string; name: string; category: string | null; stock: number }[];
  orders: { id: string; customer: string; total: number; status: OrderStatus }[];
  members: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" }[];
  clients: { name: string; ordersCount: number }[];
}

export function search(q: string) {
  return api<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
}

export function fetchOrders(params: OrdersParams) {
  const p = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sort: params.sort,
  });
  if (params.status) p.set("status", params.status);
  if (params.customer) p.set("customer", params.customer);
  return api<OrdersResponse>(`/orders?${p}`);
}

export function fetchProducts(params: ProductsParams) {
  const p = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    stock: params.stock,
  });
  return api<ProductsResponse>(`/products?${p}`);
}

// ─── Response / domain types ──────────────────────────────────────────────────

export interface Stats {
  revenueTotal: number;
  ordersCount: number;
  avgBasket: number;
  productsCount: number;
  revenueByMonth: { month: string; revenue: number }[];
  topProducts: { name: string; sold: number; revenue: number }[];
  lowStock: { id: string; name: string; stock: number }[];
  recentOrders: { id: string; customer: string; total: number; status: OrderStatus; createdAt: string }[];
}

export interface PurchaseSummary {
  id: string;
  name: string;
  category: string | null;
  currentStock: number;
  orderedQuantity: number;
  stockBeforePurchases: number;
  unitPrice: number;
  revenue: number;
}

export interface AdminNotifications {
  counts: { pendingOrders: number; cancelledOrders: number; lowStockProducts: number; total: number };
  pendingOrders: { id: string; customer: string }[];
  cancelledOrders: { id: string; customer: string }[];
  lowStockProducts: { id: string; name: string; stock: number }[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface Session {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  isCurrent: boolean;
}

export interface Order {
  id: string;
  customer: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  _count: { items: number };
}

export interface OrderDetail extends Order {
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    product: { id: string; name: string; category: string | null };
  }[];
  statusHistory: {
    id: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    createdAt: string;
    changedBy: { id: string; name: string; email: string };
  }[];
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Product {
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

export interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  stats: { totalOrdered: number; totalCurrentStock: number; totalBeforePurchases: number };
}
