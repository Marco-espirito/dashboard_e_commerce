import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// 🔒 Réservé aux admins
router.use(authenticate, requireAdmin);

// GET /api/orders → toutes les commandes, les plus récentes d'abord
router.get("/", async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customer: true,
      total: true,
      status: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  return res.json({ orders });
});

// GET /api/orders/:id -> detail d'une commande avec ses articles
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      customer: true,
      total: true,
      status: true,
      createdAt: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          product: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Commande introuvable" });
  }

  return res.json({ order });
});
const statusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"]),
});

// PATCH /api/orders/:id/status → change le statut d'une commande
router.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  const { id } = req.params;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Commande introuvable" });
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status: parsed.data.status },
    select: { id: true, status: true },
  });

  return res.json({ order });
});
export default router;
