import { describe, it, expect, beforeEach } from "vitest";
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
} from "../../test/helpers";

let adminToken: string;

beforeEach(async () => {
  await cleanDb();
  const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
  adminToken = makeAdminToken(admin!.id);

  await createTestProduct({ name: "Clavier mécanique", category: "Périphériques" });
  await createTestMember({ email: "alice.martin@vitest.local", name: "Alice Martin" });
  await prisma.order.create({ data: { customer: "Jean Dupont", total: 5000, status: "PAID" } });
  await prisma.order.create({ data: { customer: "Jean Dupont", total: 3000, status: "SHIPPED" } });
});

function search(q: string, token = adminToken) {
  return request(app).get(`/api/search?q=${encodeURIComponent(q)}`).set("Authorization", `Bearer ${token}`);
}

describe("GET /api/search", () => {
  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/search?q=test");
    expect(res.status).toBe(401);
  });

  it("retourne 403 pour un membre non-admin", async () => {
    const res = await search("test", makeMemberToken("some-id"));
    expect(res.status).toBe(403);
  });

  it("trouve un produit par son nom", async () => {
    const res = await search("clavier");
    expect(res.status).toBe(200);
    expect(res.body.products.some((p: { name: string }) => p.name === "Clavier mécanique")).toBe(true);
  });

  it("trouve un produit par sa catégorie", async () => {
    const res = await search("périph");
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it("trouve un membre par email", async () => {
    const res = await search("alice.martin");
    expect(res.body.members.some((m: { email: string }) => m.email === "alice.martin@vitest.local")).toBe(true);
  });

  it("trouve les commandes d'un client", async () => {
    const res = await search("jean");
    expect(res.body.orders.length).toBe(2);
  });

  it("regroupe les clients avec le nombre de commandes", async () => {
    const res = await search("dupont");
    const client = res.body.clients.find((c: { name: string }) => c.name === "Jean Dupont");
    expect(client).toBeDefined();
    expect(client.ordersCount).toBe(2);
  });

  it("est insensible à la casse", async () => {
    const res = await search("CLAVIER");
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it("renvoie des listes vides pour une requête trop courte", async () => {
    const res = await search("a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [], orders: [], members: [], clients: [] });
  });
});
