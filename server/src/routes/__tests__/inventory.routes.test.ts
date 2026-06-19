import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  makeAdminToken,
  makeMemberToken,
  createTestProduct,
  cleanDb,
} from "../../test/helpers";

let adminToken: string;
let p1: { id: string }, p2: { id: string }, p3: { id: string };

beforeEach(async () => {
  await cleanDb();
  const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
  adminToken = makeAdminToken(admin!.id);

  p1 = await createTestProduct({ name: "Critique", price: 1000, stock: 3 });
  p2 = await createTestProduct({ name: "Faible", price: 500, stock: 8 });
  p3 = await createTestProduct({ name: "OK", price: 200, stock: 50 });

  // 2 ventes du produit p1
  await prisma.order.create({
    data: {
      customer: "Client", status: "PAID", total: 2000,
      items: { create: [{ productId: p1.id, quantity: 2, unitPrice: 1000 }] },
    },
  });
});

const auth = () => ({ Authorization: `Bearer ${adminToken}` });

describe("GET /api/inventory", () => {
  it("retourne 401 sans token", async () => {
    expect((await request(app).get("/api/inventory")).status).toBe(401);
  });

  it("retourne 403 pour un membre", async () => {
    const res = await request(app).get("/api/inventory").set("Authorization", `Bearer ${makeMemberToken("x")}`);
    expect(res.status).toBe(403);
  });

  it("calcule statut, valeur et ventes par produit", async () => {
    const res = await request(app).get("/api/inventory").set(auth());
    expect(res.status).toBe(200);

    const crit = res.body.items.find((i: { name: string }) => i.name === "Critique");
    expect(crit).toMatchObject({ status: "CRITICAL", stock: 3, sold: 2, unitPrice: 1000, stockValue: 3000 });

    const faible = res.body.items.find((i: { name: string }) => i.name === "Faible");
    expect(faible.status).toBe("LOW");

    const ok = res.body.items.find((i: { name: string }) => i.name === "OK");
    expect(ok.status).toBe("OK");
  });

  it("calcule les totaux", async () => {
    const res = await request(app).get("/api/inventory").set(auth());
    expect(res.body.totals).toMatchObject({
      totalProducts: 3,
      totalStock: 61,
      totalSold: 2,
      totalStockValue: 3000 + 4000 + 10000, // 17000
    });
  });
});

describe("POST /api/inventory/movements", () => {
  it("ajoute du stock et enregistre le mouvement", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p3.id, type: "STOCK_ADDED", quantity: 10 });

    expect(res.status).toBe(201);
    expect(res.body.stock).toBe(60);

    const mv = await prisma.stockMovement.findFirst({ where: { productId: p3.id, type: "STOCK_ADDED" } });
    expect(mv?.quantity).toBe(10);
    expect(mv?.stockAfter).toBe(60);
  });

  it("retire du stock", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p2.id, type: "STOCK_REMOVED", quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.stock).toBe(5);
  });

  it("refuse un retrait supérieur au stock", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p1.id, type: "STOCK_REMOVED", quantity: 99 });
    expect(res.status).toBe(400);
  });

  it("gère un retour produit (entrée)", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p1.id, type: "RETURN", quantity: 2 });
    expect(res.body.stock).toBe(5);
  });

  it("gère une correction manuelle signée (négative)", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p3.id, type: "MANUAL_CORRECTION", quantity: -5 });
    expect(res.body.stock).toBe(45);
  });

  it("refuse une quantité nulle", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set(auth())
      .send({ productId: p3.id, type: "STOCK_ADDED", quantity: 0 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/inventory/movements", () => {
  it("liste les mouvements et filtre par type", async () => {
    await request(app).post("/api/inventory/movements").set(auth())
      .send({ productId: p3.id, type: "STOCK_ADDED", quantity: 10 });
    await request(app).post("/api/inventory/movements").set(auth())
      .send({ productId: p2.id, type: "STOCK_REMOVED", quantity: 1 });

    const res = await request(app).get("/api/inventory/movements?type=STOCK_ADDED").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.movements.length).toBeGreaterThan(0);
    expect(res.body.movements.every((m: { type: string }) => m.type === "STOCK_ADDED")).toBe(true);
    expect(res.body.movements[0].product).toHaveProperty("name");
  });
});
