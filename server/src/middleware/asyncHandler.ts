import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Enveloppe un handler async et passe toute erreur levée à `next(err)`.
 * Sans ça, les promesses rejetées dans les routes sont des unhandledRejections
 * qu'Express ne sait pas intercepter.
 *
 * Utilisation :
 *   router.get("/", asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
