import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  makeAdminToken,
  makeMemberToken,
  createTestMember,
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

// Nettoyer les membres et les audit logs créés entre chaque test
beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  // Supprimer les membres de test (pas l'admin)
  await prisma.user.deleteMany({
    where: { email: { not: TEST_ADMIN_EMAIL } },
  });
});

// ─── GET /api/members ─────────────────────────────────────────────────────────

describe("GET /api/members", () => {
  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/members");
    expect(res.status).toBe(401);
  });

  it("retourne 403 avec un token MEMBER", async () => {
    const member = await createTestMember({}, adminId);
    const token = makeMemberToken(member.id);

    const res = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("retourne la liste des membres", async () => {
    await createTestMember({ name: "Alice", email: "alice@vitest.local" }, adminId);
    await createTestMember({ name: "Bob", email: "bob@vitest.local" }, adminId);

    const res = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    // L'admin + 2 membres = au moins 3
    expect(res.body.members.length).toBeGreaterThanOrEqual(2);
    // Le mot de passe ne doit jamais être renvoyé
    res.body.members.forEach((m: Record<string, unknown>) => {
      expect(m).not.toHaveProperty("password");
    });
  });
});

// ─── POST /api/members ────────────────────────────────────────────────────────

describe("POST /api/members", () => {
  it("crée un membre avec le rôle MEMBER par défaut et retourne 201", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Nouveau Membre",
        email: "nouveau@vitest.local",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      name: "Nouveau Membre",
      email: "nouveau@vitest.local",
      role: "MEMBER",
    });
    expect(res.body.member).not.toHaveProperty("password");
  });

  it("peut créer un membre avec le rôle ADMIN", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Nouvel Admin",
        email: "newadmin@vitest.local",
        password: "password123",
        role: "ADMIN",
      });

    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe("ADMIN");
  });

  it("crée une entrée d'audit log à la création", async () => {
    await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Membre Audité",
        email: "audite@vitest.local",
        password: "password123",
      });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CREATE", entity: "MEMBER" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entityLabel).toBe("audite@vitest.local");
    expect(audit?.userId).toBe(adminId);
  });

  it("retourne 409 si l'email est déjà utilisé", async () => {
    await createTestMember({ email: "doublon@vitest.local" }, adminId);

    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Doublon",
        email: "doublon@vitest.local",
        password: "password123",
      });

    expect(res.status).toBe(409);
  });

  it("retourne 400 si le nom est trop court (< 2 chars)", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "A", email: "court@vitest.local", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si le mot de passe est trop court (< 6 chars)", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdp@vitest.local", password: "123" });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si l'email est invalide", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "pas-un-email", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si le rôle est invalide", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Valide",
        email: "role@vitest.local",
        password: "password123",
        role: "SUPERADMIN",
      });

    expect(res.status).toBe(400);
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app)
      .post("/api/members")
      .send({ name: "Test", email: "t@t.com", password: "password123" });

    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/members/:id ──────────────────────────────────────────────────

describe("DELETE /api/members/:id", () => {
  it("supprime un membre existant et retourne 200", async () => {
    const member = await createTestMember(
      { email: "todelete@vitest.local" },
      adminId
    );

    const res = await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    const deleted = await prisma.user.findUnique({ where: { id: member.id } });
    expect(deleted).toBeNull();
  });

  it("enregistre un audit log DELETE", async () => {
    const member = await createTestMember(
      { email: "auditdelete@vitest.local" },
      adminId
    );

    await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "MEMBER", entityId: member.id },
    });
    expect(audit).not.toBeNull();
  });

  it("retourne 400 si l'admin tente de se supprimer lui-même", async () => {
    const res = await request(app)
      .delete(`/api/members/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vous-même/i);
  });

  it("retourne 404 pour un id inexistant", async () => {
    const res = await request(app)
      .delete("/api/members/id-qui-nexiste-pas")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("retourne 401 sans token", async () => {
    const member = await createTestMember({}, adminId);

    const res = await request(app).delete(`/api/members/${member.id}`);
    expect(res.status).toBe(401);
  });
});
