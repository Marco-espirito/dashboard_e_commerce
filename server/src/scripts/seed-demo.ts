import "dotenv/config";
import { prisma } from "../lib/prisma";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Prix en centimes (1990 = 19,90 €)
const PRODUCTS = [
  { name: "T-shirt coton bio", price: 1990, stock: 120, category: "Vêtements" },
  { name: "Sweat à capuche", price: 4990, stock: 8, category: "Vêtements" },
  { name: "Casquette brodée", price: 1490, stock: 60, category: "Accessoires" },
  { name: "Tote bag toile", price: 1290, stock: 5, category: "Accessoires" },
  { name: "Mug céramique", price: 1190, stock: 200, category: "Maison" },
  { name: "Bouteille inox 500ml", price: 2490, stock: 3, category: "Maison" },
  { name: "Carnet A5", price: 990, stock: 150, category: "Papeterie" },
  { name: "Stickers (lot de 10)", price: 590, stock: 9, category: "Papeterie" },
];

const CUSTOMERS = [
  "Awa Koné", "Jean Dupont", "Fatou Diallo", "Marie Leroy", "Yao Kouassi",
  "Sophie Martin", "Kofi Mensah", "Lucas Bernard", "Aminata Traoré", "Emma Petit",
];

const STATUSES = [
  "PAID", "PAID", "PAID", "DELIVERED", "DELIVERED",
  "SHIPPED", "PENDING", "CANCELLED",
] as const;

async function main() {
  console.log("🧹 Nettoyage des anciennes données de démo...");
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();

  console.log("📦 Création des produits...");
  const products = [];
  for (const p of PRODUCTS) {
    products.push(await prisma.product.create({ data: { ...p, initialStock: p.stock } }));
  }

  console.log("🛒 Génération des commandes (6 derniers mois)...");
  const now = Date.now();
  const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 165;

  for (let i = 0; i < 110; i++) {
    const createdAt = new Date(now - Math.floor(Math.random() * SIX_MONTHS_MS));
    const status = pick(STATUSES);

    const nbItems = rand(1, 3);
    const chosen = new Set<number>();
    while (chosen.size < nbItems) chosen.add(rand(0, products.length - 1));

    let total = 0;
    const itemsData = [];
    for (const idx of chosen) {
      const product = products[idx];
      const quantity = rand(1, 4);
      total += product.price * quantity;
      itemsData.push({ productId: product.id, quantity, unitPrice: product.price });
    }

    await prisma.order.create({
      data: { customer: pick(CUSTOMERS), status, total, createdAt, items: { create: itemsData } },
    });
  }

  const count = await prisma.order.count();
  console.log(`✅ Démo prête : ${products.length} produits, ${count} commandes.`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
