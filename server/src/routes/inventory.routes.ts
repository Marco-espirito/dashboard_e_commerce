import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { logStockMovement } from "../lib/stock";

const router = Router();

router.use(authenticate, requireAdmin);

/** Statut du stock selon des seuils simples. */
function stockStatus(stock: number): "OK" | "LOW" | "CRITICAL" {
  if (stock <= 5) return "CRITICAL";
  if (stock <= 10) return "LOW";
  return "OK";
}

// ─── GET /api/inventory ────────────────────────────────────────────────────────
// Vue inventaire : une ligne par produit + totaux.
router.get("/", asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      stock: true,
      initialStock: true,
      orderItems: { select: { quantity: true } },
    },
  });

  const items = products.map((p) => {
    const sold = p.orderItems.reduce((t, i) => t + i.quantity, 0);
    const stockValue = p.stock * p.price;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      stock: p.stock,
      stockBefore: p.initialStock,
      sold,
      unitPrice: p.price,
      stockValue,
      status: stockStatus(p.stock),
    };
  });

  const totals = {
    totalProducts: items.length,
    totalStock: items.reduce((t, i) => t + i.stock, 0),
    totalSold: items.reduce((t, i) => t + i.sold, 0),
    totalStockValue: items.reduce((t, i) => t + i.stockValue, 0),
    estimatedValueBeforeSales: items.reduce((t, i) => t + i.stockBefore * i.unitPrice, 0),
  };

  return res.json({ items, totals });
}));

// ─── GET /api/inventory/movements ─────────────────────────────────────────────
const movementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().optional(),
  type: z.enum(["STOCK_ADDED", "STOCK_REMOVED", "SALE", "RETURN", "MANUAL_CORRECTION"]).optional(),
});

router.get("/movements", asyncHandler(async (req, res) => {
  const parsed = movementsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const { page, limit, productId, type } = parsed.data;

  const where = {
    ...(productId ? { productId } : {}),
    ...(type ? { type } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        quantity: true,
        stockAfter: true,
        reason: true,
        createdAt: true,
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return res.json({ movements: rows, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── POST /api/inventory/movements ────────────────────────────────────────────
// Enregistre un mouvement manuel et met à jour le stock du produit.
const createMovementSchema = z.object({
  productId: z.string().min(1, "Produit requis"),
  type: z.enum(["STOCK_ADDED", "STOCK_REMOVED", "RETURN", "MANUAL_CORRECTION"]),
  quantity: z.number().int().refine((n) => n !== 0, "La quantité ne peut pas être nulle"),
  reason: z.string().trim().max(200).optional(),
});

router.post("/movements", asyncHandler(async (req, res) => {
  const parsed = createMovementSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const { productId, type, quantity, reason } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, "Produit introuvable");

  // Direction selon le type. Pour la correction manuelle, la quantité est signée.
  let delta: number;
  if (type === "STOCK_ADDED" || type === "RETURN") {
    if (quantity < 0) throw new AppError(400, "La quantité doit être positive pour ce type.");
    delta = quantity;
  } else if (type === "STOCK_REMOVED") {
    if (quantity < 0) throw new AppError(400, "La quantité doit être positive pour ce type.");
    delta = -quantity;
  } else {
    // MANUAL_CORRECTION : delta signé
    delta = quantity;
  }

  const newStock = product.stock + delta;
  if (newStock < 0) {
    throw new AppError(400, "Stock insuffisant pour ce mouvement.");
  }

  await prisma.product.update({ where: { id: productId }, data: { stock: newStock } });
  await logStockMovement({
    productId,
    type,
    quantity: delta,
    stockAfter: newStock,
    reason: reason || null,
    userId: req.user!.userId,
  });

  return res.status(201).json({ success: true, stock: newStock });
}));

export default router;
