import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const productsQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  sort: z.enum(["NEWEST", "PRICE_ASC", "PRICE_DESC", "NAME_ASC"]).default("NEWEST"),
});

// GET /api/shop/products
router.get("/products", asyncHandler(async (req, res) => {
  const parsed = productsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const { q, category, sort } = parsed.data;

  const where = {
    stock: { gt: 0 },
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(category ? { category } : {}),
  };

  const orderBy =
    sort === "PRICE_ASC" ? { price: "asc" as const } :
    sort === "PRICE_DESC" ? { price: "desc" as const } :
    sort === "NAME_ASC" ? { name: "asc" as const } :
    { createdAt: "desc" as const };

  const [products, categories] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        category: true,
      },
    }),
    prisma.product.findMany({
      where: { stock: { gt: 0 }, category: { not: null } },
      distinct: ["category"],
      orderBy: { category: "asc" },
      select: { category: true },
    }),
  ]);

  return res.json({
    products,
    categories: categories.map((c) => c.category).filter(Boolean),
  });
}));

// GET /api/shop/products/:id
router.get("/products/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const product = await prisma.product.findFirst({
    where: { id, stock: { gt: 0 } },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      category: true,
    },
  });

  if (!product) throw new AppError(404, "Produit introuvable");
  return res.json({ product });
}));

const checkoutSchema = z.object({
  customer: z.string().trim().min(2, "Le nom est requis").max(80),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
  })).min(1, "Le panier est vide"),
});

// POST /api/shop/orders
router.post("/orders", asyncHandler(async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);
  const { customer, items } = parsed.data;

  const order = await prisma.$transaction(async (tx) => {
    const productIds = items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, stock: true },
    });

    if (products.length !== new Set(productIds).size) {
      throw new AppError(400, "Un produit du panier est introuvable");
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    let total = 0;

    for (const item of items) {
      const product = productById.get(item.productId)!;
      if (product.stock < item.quantity) {
        throw new AppError(400, `Stock insuffisant pour ${product.name}`);
      }
      total += product.price * item.quantity;
    }

    const created = await tx.order.create({
      data: {
        customer,
        status: "PENDING",
        total,
        items: {
          create: items.map((item) => {
            const product = productById.get(item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: product.price,
            };
          }),
        },
      },
      select: { id: true, customer: true, total: true, status: true, createdAt: true },
    });

    for (const item of items) {
      const product = productById.get(item.productId)!;
      const updated = await tx.product.update({
        where: { id: item.productId },
        data: { stock: product.stock - item.quantity },
        select: { stock: true },
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "SALE",
          quantity: -item.quantity,
          stockAfter: updated.stock,
          reason: `Commande ${created.id}`,
        },
      });
    }

    return created;
  });

  return res.status(201).json({ order });
}));

export default router;
