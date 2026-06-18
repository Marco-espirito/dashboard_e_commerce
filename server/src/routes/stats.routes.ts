import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

// 🔒 Stats réservées aux admins
router.use(authenticate, requireAdmin);

const REVENUE_STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// GET /api/stats/overview
router.get("/overview", async (_req, res) => {
  // Totaux
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
  // CA des 6 derniers mois (agrégé en JS)
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
  // Top produits (par CA généré)
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

  // Stock faible (<= 10 unités)
  const lowStock = await prisma.product.findMany({
    where: { stock: { lte: 10 } },
    orderBy: { stock: "asc" },
    take: 6,
    select: { id: true, name: true, stock: true },
  });

  // Commandes récentes
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, customer: true, total: true, status: true, createdAt: true },
  });
  return res.json({
    revenueTotal,
    ordersCount,
    avgBasket,
    productsCount,
    revenueByMonth,
    topProducts,
    lowStock,
    recentOrders,
  });
});

export default router;
