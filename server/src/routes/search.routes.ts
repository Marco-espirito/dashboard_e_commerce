import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate, requireAdmin);

const querySchema = z.object({
  q: z.string().trim().min(2, "Au moins 2 caractères"),
});

const LIMIT = 6;

// GET /api/search?q=...
// Recherche globale : produits, commandes, membres, clients (nom de commande).
router.get("/", asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    // Requête trop courte → on renvoie des listes vides plutôt qu'une erreur.
    return res.json({ products: [], orders: [], members: [], clients: [] });
  }

  const { q } = parsed.data;
  const contains = { contains: q, mode: "insensitive" as const };

  const [products, orders, members] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ name: contains }, { category: contains }] },
      take: LIMIT,
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, stock: true },
    }),
    prisma.order.findMany({
      where: { customer: contains },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, customer: true, total: true, status: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, OR: [{ name: contains }, { email: contains }] },
      take: LIMIT,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  // groupBy gardé hors $transaction (son typage se dégrade dans le tableau).
  const clientsRaw = await prisma.order.groupBy({
    by: ["customer"],
    where: { customer: contains },
    _count: { customer: true },
    orderBy: { _count: { customer: "desc" } },
    take: LIMIT,
  });

  const clients = clientsRaw.map((c) => ({
    name: c.customer,
    ordersCount: c._count.customer,
  }));

  return res.json({ products, orders, members, clients });
}));

export default router;
