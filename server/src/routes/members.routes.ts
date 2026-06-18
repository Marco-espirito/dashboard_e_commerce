import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(authenticate, requireAdmin);

const createMemberSchema = z.object({
  name: z.string().min(2, "Le nom doit faire au moins 2 caractères"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

// GET /api/members
router.get("/", asyncHandler(async (_req, res) => {
  const members = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  return res.json({ members });
}));

// POST /api/members
router.post("/", asyncHandler(async (req, res) => {
  const parsed = createMemberSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "Cet email est déjà utilisé");

  const hashed = await bcrypt.hash(password, 10);

  const member = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      createdById: req.user!.userId,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await logAudit({
    action: "CREATE",
    entity: "MEMBER",
    entityId: member.id,
    entityLabel: member.email,
    userId: req.user!.userId,
    metadata: { name: member.name, email: member.email, role: member.role },
  });

  return res.status(201).json({ member });
}));

// DELETE /api/members/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  if (id === req.user!.userId) {
    throw new AppError(400, "Vous ne pouvez pas vous supprimer vous-même");
  }

  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) throw new AppError(404, "Membre introuvable");

  await logAudit({
    action: "DELETE",
    entity: "MEMBER",
    entityId: id,
    entityLabel: member.email,
    userId: req.user!.userId,
    metadata: { name: member.name, email: member.email, role: member.role },
  });

  await prisma.user.delete({ where: { id } });
  return res.json({ success: true });
}));

export default router;
