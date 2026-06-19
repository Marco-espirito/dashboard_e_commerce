import { prisma } from "./prisma";
import { logger } from "./logger";

export type StockMovementType =
  | "STOCK_ADDED"
  | "STOCK_REMOVED"
  | "SALE"
  | "RETURN"
  | "MANUAL_CORRECTION";

interface LogStockMovementParams {
  productId: string;
  type: StockMovementType;
  /** Quantité signée : positif = entrée, négatif = sortie. */
  quantity: number;
  stockAfter?: number | null;
  reason?: string | null;
  userId?: string | null;
}

/**
 * Enregistre un mouvement de stock. Best-effort : n'interrompt jamais
 * l'opération métier principale (création/édition de produit…).
 */
export async function logStockMovement(params: LogStockMovementParams): Promise<void> {
  try {
    await prisma.stockMovement.create({
      data: {
        productId: params.productId,
        type: params.type,
        quantity: params.quantity,
        stockAfter: params.stockAfter ?? null,
        reason: params.reason ?? null,
        userId: params.userId ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, params }, "Échec écriture mouvement de stock");
  }
}
