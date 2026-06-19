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

beforeEach(async () => {
  await cleanDb();
  const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
  adminToken = makeAdminToken(admin!.id);

  const p1 = await createTestProduct({ name: "Produit A" });
  const p2 = await createTestProduct({ name: "Produit B" });

  // 2 commandes encaissées pour "Riche" (créées aujourd'hui)
  await prisma.order.create({
    data: {
      customer: "Riche", status: "PAID", total: 10000,
      items: { create: [{ productId: p1.id, quantity: 3, unitPrice: 1000 }] },
    },
  });
  await prisma.order.create({
    data: {
      customer: "Riche", status: "DELIVERED", total: 5000,
      items: { create: [{ productId: p2.id, quantity: 1, unitPrice: 5000 }] },
    },
  });
  // 1 commande annulée
  await prisma.order.create({
    data: {
      customer: "Pauvre", status: "CANCELLED", total: 2000,
      items: { create: [{ productId: p1.id, quantity: 1, unitPrice: 2000 }] },
    },
  });
});

function overview(token = adminToken) {
  return request(app).get("/api/stats/overview").set("Authorization", `Bearer ${token}`);
}

describe("GET /api/stats/overview — KPIs", () => {
  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/stats/overview");
    expect(res.status).toBe(401);
  });

  it("retourne 403 pour un membre", async () => {
    const res = await overview(makeMemberToken("x"));
    expect(res.status).toBe(403);
  });

  it("compte les commandes du jour", async () => {
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.ordersToday).toBe(3);
  });

  it("calcule le CA du jour (hors annulées)", async () => {
    const res = await overview();
    expect(res.body.revenueToday).toBe(15000);
  });

  it("calcule le taux d'annulation", async () => {
    const res = await overview();
    // 1 annulée sur 3 → 33.3 %
    expect(res.body.cancellationRate).toBeCloseTo(33.3, 1);
  });

  it("identifie le meilleur client", async () => {
    const res = await overview();
    expect(res.body.bestClient).toMatchObject({
      name: "Riche",
      revenue: 15000,
      ordersCount: 2,
    });
  });

  it("liste les produits les plus vendus ce mois-ci (hors annulées)", async () => {
    const res = await overview();
    const top = res.body.topProductsThisMonth;
    expect(top[0]).toMatchObject({ name: "Produit A", sold: 3 });
    // Le produit de la commande annulée ne gonfle pas le total
    expect(top.find((p: { name: string }) => p.name === "Produit A").sold).toBe(3);
  });
});
