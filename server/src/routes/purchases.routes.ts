import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/summary", asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      stock: true,
      initialStock: true,
      price: true,
      orderItems: {
        select: { quantity: true, unitPrice: true },
      },
    },
  });

  const summary = products.map((product) => {
    const orderedQuantity = product.orderItems.reduce(
      (total, item) => total + item.quantity,
      0
    );
    const revenue = product.orderItems.reduce(
      (total, item) => total + item.quantity * item.unitPrice,
      0
    );
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      currentStock: product.stock,
      orderedQuantity,
      stockBeforePurchases: product.initialStock,
      unitPrice: product.price,
      revenue,
    };
  });

  return res.json({ summary });
}));

export default router;
