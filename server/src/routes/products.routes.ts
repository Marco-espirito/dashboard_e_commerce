import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { logAudit, diffObjects } from "../lib/audit";
import { logStockMovement } from "../lib/stock";

const router = Router();

router.use(authenticate, requireAdmin);

const productSchema = z.object({
  name: z.string().min(2, "Le nom doit faire au moins 2 caracteres"),
  price: z.number().int().min(0, "Le prix doit etre positif"),
  stock: z.number().int().min(0, "Le stock doit etre positif"),
  category: z.string().trim().optional().nullable(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  stock: z.enum(["low", "all"]).default("all"),
});

// Sélection réutilisée pour les requêtes renvoyant un produit avec ses stats
const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
  initialStock: true,
  category: true,
  createdAt: true,
  orderItems: { select: { quantity: true } },
  _count: { select: { orderItems: true } },
} as const;

function withStockStats<
  T extends { initialStock: number; orderItems: { quantity: number }[] }
>(product: T) {
  const orderedQuantity = product.orderItems.reduce(
    (total, item) => total + item.quantity,
    0
  );
  const { orderItems, ...rest } = product;
  return { ...rest, orderedQuantity, stockBeforePurchases: product.initialStock };
}

// GET /api/products
router.get("/", asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { page, limit, stock } = parsed.data;
  const where = stock === "low" ? { stock: { lte: 10 } } : {};

  const [products, total, globalStats, orderedAgg] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: PRODUCT_SELECT,
    }),
    prisma.product.count({ where }),
    prisma.product.aggregate({ _sum: { stock: true, initialStock: true } }),
    prisma.orderItem.aggregate({ _sum: { quantity: true } }),
  ]);

  return res.json({
    products: products.map(withStockStats),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: {
      totalCurrentStock: globalStats._sum.stock ?? 0,
      totalBeforePurchases: globalStats._sum.initialStock ?? 0,
      totalOrdered: orderedAgg._sum.quantity ?? 0,
    },
  });
}));

// POST /api/products
router.post("/", asyncHandler(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const product = await prisma.product.create({
    data: {
      ...parsed.data,
      initialStock: parsed.data.stock,
      category: parsed.data.category?.trim() || null,
    },
    select: PRODUCT_SELECT,
  });

  await logAudit({
    action: "CREATE",
    entity: "PRODUCT",
    entityId: product.id,
    entityLabel: product.name,
    userId: req.user!.userId,
    metadata: { name: product.name, price: product.price, stock: product.stock, category: product.category },
  });

  // Mouvement de stock initial
  if (product.stock > 0) {
    await logStockMovement({
      productId: product.id,
      type: "STOCK_ADDED",
      quantity: product.stock,
      stockAfter: product.stock,
      reason: "Stock initial à la création",
      userId: req.user!.userId,
    });
  }

  return res.status(201).json({ product: withStockStats(product) });
}));

// PATCH /api/products/:id
router.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const id = req.params.id as string;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Produit introuvable");

  const product = await prisma.product.update({
    where: { id },
    data: { ...parsed.data, category: parsed.data.category?.trim() || null },
    select: PRODUCT_SELECT,
  });

  const before = { name: existing.name, price: existing.price, stock: existing.stock, category: existing.category };
  const after  = { name: product.name,  price: product.price,  stock: product.stock,  category: product.category };
  await logAudit({
    action: "UPDATE",
    entity: "PRODUCT",
    entityId: product.id,
    entityLabel: product.name,
    userId: req.user!.userId,
    metadata: diffObjects(before, after),
  });

  // Si le stock a changé via la fiche produit → mouvement de correction
  if (product.stock !== existing.stock) {
    await logStockMovement({
      productId: product.id,
      type: "MANUAL_CORRECTION",
      quantity: product.stock - existing.stock,
      stockAfter: product.stock,
      reason: "Modification via la fiche produit",
      userId: req.user!.userId,
    });
  }

  return res.json({ product: withStockStats(product) });
}));

// DELETE /api/products/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, _count: { select: { orderItems: true } } },
  });

  if (!product) throw new AppError(404, "Produit introuvable");

  if (product._count.orderItems > 0) {
    throw new AppError(409, "Ce produit est utilise dans des commandes et ne peut pas etre supprime");
  }

  // On récupère le nom avant suppression pour le conserver dans l'audit
  const fullProduct = await prisma.product.findUnique({
    where: { id },
    select: { name: true, price: true, stock: true, category: true },
  });

  await prisma.product.delete({ where: { id } });

  await logAudit({
    action: "DELETE",
    entity: "PRODUCT",
    entityId: id,
    entityLabel: fullProduct!.name,
    userId: req.user!.userId,
    metadata: { name: fullProduct!.name, price: fullProduct!.price, stock: fullProduct!.stock },
  });

  return res.json({ success: true });
}));

export default router;
