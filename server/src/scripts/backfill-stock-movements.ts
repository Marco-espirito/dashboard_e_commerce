import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Rétro-génère l'historique des mouvements de stock à partir des données
 * existantes : stock initial de chaque produit + ventes issues des commandes.
 * Idempotent : on repart d'une table vide à chaque exécution.
 *
 *   npm run backfill:movements
 */
async function main() {
  await prisma.stockMovement.deleteMany();

  const products = await prisma.product.findMany({
    select: { id: true, initialStock: true, createdAt: true },
  });

  // 1) Stock initial (entrée) pour chaque produit
  const initialMovements = products
    .filter((p) => p.initialStock > 0)
    .map((p) => ({
      productId: p.id,
      type: "STOCK_ADDED" as const,
      quantity: p.initialStock,
      stockAfter: p.initialStock,
      reason: "Stock initial",
      createdAt: p.createdAt,
    }));

  // 2) Ventes : une ligne par article de commande (hors commandes annulées)
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: { not: "CANCELLED" } } },
    select: {
      productId: true,
      quantity: true,
      order: { select: { customer: true, createdAt: true } },
    },
  });
  const saleMovements = orderItems.map((it) => ({
    productId: it.productId,
    type: "SALE" as const,
    quantity: -it.quantity,
    stockAfter: null,
    reason: `Vente — ${it.order.customer}`,
    createdAt: it.order.createdAt,
  }));

  const all = [...initialMovements, ...saleMovements];
  if (all.length > 0) {
    await prisma.stockMovement.createMany({ data: all });
  }

  console.log(
    `Backfill terminé : ${initialMovements.length} entrées initiales + ${saleMovements.length} ventes = ${all.length} mouvements.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
