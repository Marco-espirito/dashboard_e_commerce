import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/", asyncHandler(async (_req, res) => {
  const [pendingOrders, cancelledOrders, lowStockProducts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, customer: true, total: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { status: "CANCELLED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, customer: true, total: true, createdAt: true },
    }),
    prisma.product.findMany({
      where: { stock: { lte: 10 } },
      orderBy: { stock: "asc" },
      take: 5,
      select: { id: true, name: true, stock: true },
    }),
  ]);

  const [pendingCount, cancelledCount, lowStockCount] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CANCELLED" } }),
    prisma.product.count({ where: { stock: { lte: 10 } } }),
  ]);

  return res.json({
    counts: {
      pendingOrders: pendingCount,
      cancelledOrders: cancelledCount,
      lowStockProducts: lowStockCount,
      total: pendingCount + cancelledCount + lowStockCount,
    },
    pendingOrders,
    cancelledOrders,
    lowStockProducts,
  });
}));

export default router;
