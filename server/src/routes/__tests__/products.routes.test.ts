import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  makeAdminToken,
  makeMemberToken,
  createTestProduct,
  createTestMember,
  cleanDb,
  createTestAdmin,
} from "../../test/helpers";

// ─── Setup ────────────────────────────────────────────────────────────────────

let adminToken: string;
let adminId: string;

beforeAll(async () => {
  const admin = await prisma.user.findUnique({
    where: { email: TEST_ADMIN_EMAIL },
    select: { id: true },
  });
  adminId = admin!.id;
  adminToken = makeAdminToken(adminId);
});

// Nettoyer uniquement les produits + audit entre chaque test (pas les users)
beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
});

// ─── GET /api/products ────────────────────────────────────────────────────────

describe("GET /api/products", () => {
  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("retourne 403 avec un token MEMBER (non-admin)", async () => {
    const member = await createTestMember({}, adminId);
    const token = makeMemberToken(member.id);

    const res = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("retourne la liste paginée des produits", async () => {
    await createTestProduct({ name: "Produit A" });
    await createTestProduct({ name: "Produit B" });
    await createTestProduct({ name: "Produit C" });

    const res = await request(app)
      .get("/api/products?page=1&limit=2")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.stats).toHaveProperty("totalCurrentStock");
  });

  it("filtre les produits en rupture de stock (stock <= 10)", async () => {
    await createTestProduct({ name: "Stock normal", stock: 100 });
    await createTestProduct({ name: "Stock bas", stock: 5 });
    await createTestProduct({ name: "Rupture", stock: 0 });

    const res = await request(app)
      .get("/api/products?stock=low")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    res.body.products.forEach((p: { stock: number }) => {
      expect(p.stock).toBeLessThanOrEqual(10);
    });
  });

  it("retourne une liste vide quand il n'y a aucun produit", async () => {
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("retourne 400 pour une page invalide", async () => {
    const res = await request(app)
      .get("/api/products?page=0")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/products ───────────────────────────────────────────────────────

describe("POST /api/products", () => {
  it("crée un produit et retourne 201", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Nouveau produit", price: 2999, stock: 10, category: "Électronique" });

    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({
      name: "Nouveau produit",
      price: 2999,
      stock: 10,
      category: "Électronique",
    });
    // Le stock initial doit être initialisé avec le stock de création
    expect(res.body.product.stockBeforePurchases).toBe(10);
  });

  it("crée une entrée d'audit log lors de la création", async () => {
    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Produit audité", price: 500, stock: 20 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CREATE", entity: "PRODUCT" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entityLabel).toBe("Produit audité");
    expect(audit?.userId).toBe(adminId);
  });

  it("accepte une catégorie nulle", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sans catégorie", price: 100, stock: 5, category: null });

    expect(res.status).toBe(201);
    expect(res.body.product.category).toBeNull();
  });

  it("retourne 400 si le nom est trop court", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "A", price: 100, stock: 5 });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si le prix est négatif", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Produit invalide", price: -10, stock: 5 });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si le stock est manquant", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Incomplet", price: 100 });

    expect(res.status).toBe(400);
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Produit", price: 100, stock: 5 });

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/products/:id ──────────────────────────────────────────────────

describe("PATCH /api/products/:id", () => {
  it("met à jour un produit existant", async () => {
    const product = await createTestProduct({ name: "Avant", price: 1000 });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Après", price: 1500, stock: 30 });

    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ name: "Après", price: 1500 });
  });

  it("enregistre un diff dans l'audit log lors d'une mise à jour", async () => {
    const product = await createTestProduct({ name: "Avant", price: 1000, stock: 5 });

    await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Après", price: 2000, stock: 5 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE", entity: "PRODUCT", entityId: product.id },
    });
    expect(audit).not.toBeNull();
    // Le diff doit contenir les champs modifiés
    const metadata = audit?.metadata as Record<string, { from: unknown; to: unknown }>;
    expect(metadata).toHaveProperty("name");
    expect(metadata.name).toMatchObject({ from: "Avant", to: "Après" });
    expect(metadata).toHaveProperty("price");
    // Le stock n'a pas changé → il ne doit pas figurer dans le diff
    expect(metadata).not.toHaveProperty("stock");
  });

  it("retourne 404 pour un id inexistant", async () => {
    const res = await request(app)
      .patch("/api/products/id-qui-nexiste-pas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", price: 100, stock: 5 });

    expect(res.status).toBe(404);
  });

  it("retourne 400 pour des données invalides", async () => {
    const product = await createTestProduct();

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Ok", price: "pas-un-nombre", stock: 5 });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────

describe("DELETE /api/products/:id", () => {
  it("supprime un produit sans commandes et retourne 200", async () => {
    const product = await createTestProduct({ name: "À supprimer" });

    const res = await request(app)
      .delete(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    // Vérifier que le produit est bien supprimé en base
    const deleted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(deleted).toBeNull();
  });

  it("enregistre un audit log DELETE", async () => {
    const product = await createTestProduct({ name: "Produit supprimé" });

    await request(app)
      .delete(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "PRODUCT", entityId: product.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entityLabel).toBe("Produit supprimé");
  });

  it("retourne 409 si le produit est lié à des commandes", async () => {
    const product = await createTestProduct({ name: "Avec commandes" });

    // Créer une commande qui utilise ce produit
    const order = await prisma.order.create({
      data: {
        customer: "Client Test",
        status: "PAID",
        total: product.price,
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            unitPrice: product.price,
          },
        },
      },
    });

    const res = await request(app)
      .delete(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);

    // Cleanup
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  });

  it("retourne 404 pour un id inexistant", async () => {
    const res = await request(app)
      .delete("/api/products/id-inexistant")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
