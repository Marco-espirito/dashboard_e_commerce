import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";

const router = Router();

router.use(authenticate, requireAdmin);

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  sort: z.enum(["DATE_DESC", "DATE_ASC", "TOTAL_DESC", "TOTAL_ASC"]).default("DATE_DESC"),
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"]),
});

// GET /api/orders
router.get("/", asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0].message);
  }
  const { page, limit, status, sort } = parsed.data;

  const where = status ? { status } : {};
  const orderBy =
    sort === "DATE_ASC" ? { createdAt: "asc" as const } :
    sort === "TOTAL_DESC" ? { total: "desc" as const } :
    sort === "TOTAL_ASC" ? { total: "asc" as const } :
    { createdAt: "desc" as const };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where, orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, customer: true, total: true, status: true, createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return res.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
}));

// GET /api/orders/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, customer: true, total: true, status: true, createdAt: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true, quantity: true, unitPrice: true,
          product: { select: { id: true, name: true, category: true } },
        },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, fromStatus: true, toStatus: true, createdAt: true,
          changedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!order) throw new AppError(404, "Commande introuvable");

  return res.json({ order });
}));

// PATCH /api/orders/:id/status
router.patch("/:id/status", asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "Statut invalide");

  const id = req.params.id as string;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Commande introuvable");

  if (existing.status === parsed.data.status) {
    return res.json({ order: { id: existing.id, status: existing.status } });
  }

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: existing.status,
        toStatus: parsed.data.status,
        changedById: req.user!.userId,
      },
    });

    return updated;
  });

  return res.json({ order });
}));

export default router;
