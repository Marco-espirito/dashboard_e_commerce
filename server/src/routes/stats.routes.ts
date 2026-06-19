import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";

const router = Router();

router.use(authenticate, requireAdmin);

/** Agrège les quantités vendues par produit sur une période (hors annulées). */
async function topProductsBetween(start: Date, end: Date) {
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } },
    select: { quantity: true, product: { select: { name: true } } },
  });
  const map = new Map<string, number>();
  for (const it of items) {
    map.set(it.product.name, (map.get(it.product.name) ?? 0) + it.quantity);
  }
  return Array.from(map.entries())
    .map(([name, sold]) => ({ name, sold }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5);
}

const REVENUE_STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/stats/overview
router.get("/overview", asyncHandler(async (_req, res) => {
  const revenueAgg = await prisma.order.aggregate({
    where: { status: { in: [...REVENUE_STATUSES] } },
    _sum: { total: true },
    _count: true,
  });

  const revenueTotal = revenueAgg._sum.total ?? 0;
  const revenueOrdersCount = revenueAgg._count;
  const ordersCount = await prisma.order.count();
  const avgBasket =
    revenueOrdersCount > 0 ? Math.round(revenueTotal / revenueOrdersCount) : 0;
  const productsCount = await prisma.product.count();

  const firstRevenueOrder = await prisma.order.findFirst({
    where: { status: { in: [...REVENUE_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const since = firstRevenueOrder?.createdAt ?? new Date();
  since.setMonth(0);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const ordersForChart = await prisma.order.findMany({
    where: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: since } },
    select: { total: true, createdAt: true },
  });

  const monthMap = new Map<string, number>();
  const currentMonth = new Date();
  currentMonth.setMonth(11);
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const cursor = new Date(since);
  while (cursor <= currentMonth) {
    monthMap.set(monthKey(cursor), 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const o of ordersForChart) {
    const key = monthKey(o.createdAt);
    if (monthMap.has(key)) {
      monthMap.set(key, (monthMap.get(key) ?? 0) + o.total);
    }
  }
  const revenueByMonth = Array.from(monthMap.entries()).map(
    ([month, revenue]) => ({ month, revenue })
  );

  const items = await prisma.orderItem.findMany({
    select: {
      quantity: true,
      unitPrice: true,
      product: { select: { name: true } },
    },
  });
  const productMap = new Map<string, { name: string; sold: number; revenue: number }>();
  for (const it of items) {
    const name = it.product.name;
    const entry = productMap.get(name) ?? { name, sold: 0, revenue: 0 };
    entry.sold += it.quantity;
    entry.revenue += it.quantity * it.unitPrice;
    productMap.set(name, entry);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const lowStock = await prisma.product.findMany({
    where: { stock: { lte: 10 } },
    orderBy: { stock: "asc" },
    take: 6,
    select: { id: true, name: true, stock: true },
  });

  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, customer: true, total: true, status: true, createdAt: true },
  });

  // ── KPIs « du jour » / « ce mois-ci » / clients ──────────────────────────────
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Commandes du jour (toutes) + chiffre d'affaires du jour (statuts encaissés)
  const ordersToday = await prisma.order.count({
    where: { createdAt: { gte: startOfDay } },
  });
  const revenueTodayAgg = await prisma.order.aggregate({
    where: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: startOfDay } },
    _sum: { total: true },
  });
  const revenueToday = revenueTodayAgg._sum.total ?? 0;

  // Taux d'annulation (commandes annulées / total)
  const cancelledCount = await prisma.order.count({ where: { status: "CANCELLED" } });
  const cancellationRate =
    ordersCount > 0 ? Math.round((cancelledCount / ordersCount) * 1000) / 10 : 0;

  // Meilleur client (par CA encaissé)
  const bestClientRaw = await prisma.order.groupBy({
    by: ["customer"],
    where: { status: { in: [...REVENUE_STATUSES] } },
    _sum: { total: true },
    _count: { customer: true },
    orderBy: { _sum: { total: "desc" } },
    take: 1,
  });
  const bestClient = bestClientRaw[0]
    ? {
        name: bestClientRaw[0].customer,
        revenue: bestClientRaw[0]._sum.total ?? 0,
        ordersCount: bestClientRaw[0]._count.customer,
      }
    : null;

  // Produits les plus vendus ce mois-ci (hors commandes annulées)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const topProductsThisMonth = await topProductsBetween(startOfMonth, nextMonth);

  return res.json({
    revenueTotal,
    ordersCount,
    avgBasket,
    productsCount,
    revenueByMonth,
    topProducts,
    lowStock,
    recentOrders,
    // Nouveaux KPIs
    ordersToday,
    revenueToday,
    cancellationRate,
    bestClient,
    topProductsThisMonth,
  });
}));

// GET /api/stats/top-products?month=YYYY-MM
// Top produits vendus sur un mois donné (défaut : mois courant).
const topProductsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

router.get("/top-products", asyncHandler(async (req, res) => {
  const parsed = topProductsSchema.safeParse(req.query);
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth(); // 0-based

  if (parsed.success && parsed.data.month) {
    const [y, m] = parsed.data.month.split("-").map(Number);
    year = y;
    monthIndex = m - 1;
  }

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  const products = await topProductsBetween(start, end);
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return res.json({ month, products });
}));

export default router;
