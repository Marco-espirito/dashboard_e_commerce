import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate, requireAdmin);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "ACCOUNT_LOCKED"]).optional(),
  email: z.string().optional(),
});

// GET /api/auth-events — journal des événements d'authentification (admin)
router.get("/", asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { page, limit, type, email } = parsed.data;

  const where = {
    ...(type ? { type } : {}),
    ...(email ? { email: { contains: email, mode: "insensitive" as const } } : {}),
  };

  const [events, total] = await prisma.$transaction([
    prisma.authEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.authEvent.count({ where }),
  ]);

  return res.json({ events, total, page, totalPages: Math.ceil(total / limit) });
}));

export default router;
