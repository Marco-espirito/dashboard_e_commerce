import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signToken } from "../utils/jwt";

// ─── Constantes partagées ─────────────────────────────────────────────────────

export const TEST_ADMIN_EMAIL = "test-admin@vitest.local";
export const TEST_ADMIN_PASSWORD = "TestPassword123!";

// ─── Création de l'admin de test ─────────────────────────────────────────────

/**
 * Crée l'utilisateur admin de test s'il n'existe pas encore.
 * Retourne toujours l'utilisateur (existant ou nouvellement créé).
 */
export async function createTestAdmin() {
  // upsert évite les erreurs de contrainte unique si deux suites tournent
  // en parallèle ou si la base contenait déjà cet utilisateur.
  return prisma.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: {},
    create: {
      name: "Admin Test",
      email: TEST_ADMIN_EMAIL,
      password: await bcrypt.hash(TEST_ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });
}

/**
 * Génère un JWT d'accès (admin) pour l'utilisateur donné.
 */
export function makeAdminToken(userId: string): string {
  return signToken({ userId, role: "ADMIN" });
}

/**
 * Génère un JWT d'accès (member) pour l'utilisateur donné.
 */
export function makeMemberToken(userId: string): string {
  return signToken({ userId, role: "MEMBER" });
}

// ─── Nettoyage de la base ─────────────────────────────────────────────────────

/**
 * Supprime toutes les données de test dans l'ordre qui respecte
 * les contraintes de clé étrangère.
 * L'utilisateur admin de test (TEST_ADMIN_EMAIL) est conservé.
 */
export async function cleanDb(): Promise<void> {
  // L'ordre est important : d'abord les tables qui référencent d'autres tables.
  await prisma.auditLog.deleteMany();
  await prisma.authEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  // Supprimer les users créés pendant les tests (pas l'admin de test)
  await prisma.user.deleteMany({
    where: { email: { not: TEST_ADMIN_EMAIL } },
  });
}

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Crée un produit de test en DB et retourne l'objet créé.
 */
export async function createTestProduct(overrides?: {
  name?: string;
  price?: number;
  stock?: number;
  category?: string;
}) {
  return prisma.product.create({
    data: {
      name: overrides?.name ?? "Produit Test",
      price: overrides?.price ?? 1000,
      stock: overrides?.stock ?? 50,
      initialStock: overrides?.stock ?? 50,
      category: overrides?.category ?? "Test",
    },
  });
}

/**
 * Crée un membre de test en DB.
 */
export async function createTestMember(overrides?: {
  email?: string;
  name?: string;
  role?: "ADMIN" | "MEMBER";
}, createdById?: string) {
  return prisma.user.create({
    data: {
      name: overrides?.name ?? "Membre Test",
      email: overrides?.email ?? `member-${Date.now()}@vitest.local`,
      password: await bcrypt.hash("Password1!", 10),
      role: overrides?.role ?? "MEMBER",
      createdById,
    },
  });
}
