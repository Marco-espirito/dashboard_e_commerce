import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { logger } from "../lib/logger";

// ─── Erreur métier typée ──────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

// ─── Codes d'erreur Prisma courants ──────────────────────────────────────────

const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: "Cette valeur existe déjà (contrainte unique)" },
  P2025: { status: 404, message: "Enregistrement introuvable" },
  P2003: { status: 400, message: "Référence invalide (clé étrangère)" },
  P2014: { status: 400, message: "Relation requise manquante" },
};

// ─── Middleware d'erreur Express ──────────────────────────────────────────────
// Doit avoir exactement 4 paramètres pour qu'Express le reconnaisse comme
// gestionnaire d'erreurs (même si `_next` n'est pas utilisé).

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  // Erreur métier explicite
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Erreur Prisma
  if (typeof err === "object" && err !== null && "code" in err) {
    const prismaErr = err as { code: string; message?: string };
    const mapped = PRISMA_ERROR_MAP[prismaErr.code];
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.message });
    }
  }

  // Erreur inattendue — on log mais on ne fuite pas les détails en prod
  logger.error({ err }, "Erreur interne non gérée");
  return res.status(500).json({ error: "Erreur interne du serveur" });
};
