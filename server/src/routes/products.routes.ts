import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

router.use(authenticate, requireAdmin);

const productSchema = z.object({
  name: z.string().min(2, "Le nom doit faire au moins 2 caracteres"),
  price: z.number().int().min(0, "Le prix doit etre positif"),
  stock: z.number().int().min(0, "Le stock doit etre positif"),
  category: z.string().trim().optional().nullable(),
});

function withStockStats<
  T extends { initialStock: number; orderItems: { quantity: number }[] }
>(
  product: T
) {
  const orderedQuantity = product.orderItems.reduce(
    (total, item) => total + item.quantity,
    0
  );
  const { orderItems, ...rest } = product;
  return {
    ...rest,
    orderedQuantity,
    stockBeforePurchases: product.initialStock,
  };
}

router.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      initialStock: true,
      category: true,
      createdAt: true,
      orderItems: { select: { quantity: true } },
      _count: { select: { orderItems: true } },
    },
  });

  return res.json({ products: products.map(withStockStats) });
});

router.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const product = await prisma.product.create({
    data: {
      ...parsed.data,
      initialStock: parsed.data.stock,
      category: parsed.data.category?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      initialStock: true,
      category: true,
      createdAt: true,
      orderItems: { select: { quantity: true } },
      _count: { select: { orderItems: true } },
    },
  });

  return res.status(201).json({ product: withStockStats(product) });
});

router.patch("/:id", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { id } = req.params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Produit introuvable" });
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...parsed.data,
      category: parsed.data.category?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      initialStock: true,
      category: true,
      createdAt: true,
      orderItems: { select: { quantity: true } },
      _count: { select: { orderItems: true } },
    },
  });

  return res.json({ product: withStockStats(product) });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, _count: { select: { orderItems: true } } },
  });

  if (!product) {
    return res.status(404).json({ error: "Produit introuvable" });
  }

  if (product._count.orderItems > 0) {
    return res.status(409).json({
      error:
        "Ce produit est utilise dans des commandes et ne peut pas etre supprime",
    });
  }

  await prisma.product.delete({ where: { id } });
  return res.json({ success: true });
});

export default router;
