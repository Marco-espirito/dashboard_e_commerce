import type { Request, Response, NextFunction } from "express";

/**
 * Protection CSRF par en-tête custom (défense en profondeur).
 *
 * Les endpoints qui s'authentifient via le cookie httpOnly `refreshToken`
 * (/refresh, /logout) sont sensibles au CSRF : un site malveillant pourrait
 * déclencher une requête vers notre API et le navigateur joindrait
 * automatiquement le cookie.
 *
 * Mitigation principale : SameSite=strict sur le cookie (en production).
 * Mitigation complémentaire ici : exiger un en-tête custom `X-Requested-With`.
 * Un en-tête custom n'est PAS dans la liste blanche CORS « simple » : le
 * navigateur déclenche donc un preflight OPTIONS, que seul notre origine
 * autorisée peut passer. Une requête forgée cross-site ne peut pas le poser.
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["x-requested-with"];

  if (header !== "XMLHttpRequest") {
    return res.status(403).json({ error: "Requête refusée (protection CSRF)" });
  }

  return next();
}
