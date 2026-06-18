import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../utils/jwt";

// On enrichit le type Request d'Express pour y stocker l'utilisateur décodé
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Vérifie la présence et la validité du token JWT
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }

  const token = header.slice(7);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

// À utiliser APRÈS authenticate : bloque tout ce qui n'est pas admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Accès réservé à l'administrateur" });
  }
  next();
}
