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
        password: "Password1!",
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
        password: "Password1!",
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
        password: "Password1!",
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
        password: "Password1!",
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

  it("retourne 400 si le mot de passe est trop court (< 8 chars)", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdp@vitest.local", password: "Ab1!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caractères/);
  });

  it("retourne 400 si le mot de passe n'a pas de majuscule", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdp2@vitest.local", password: "password1!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/majuscule/i);
  });

  it("retourne 400 si le mot de passe n'a pas de chiffre", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdp3@vitest.local", password: "Password!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/chiffre/i);
  });

  it("retourne 400 si le mot de passe n'a pas de caractère spécial", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdp4@vitest.local", password: "Password1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caractère spécial/i);
  });

  it("accepte un mot de passe fort (majuscule + chiffre + spécial)", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Valide", email: "mdpfort@vitest.local", password: "Password1!" });

    expect(res.status).toBe(201);
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
        password: "Password1!",
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
  it("supprime (soft delete) un membre existant et retourne 200", async () => {
    const member = await createTestMember(
      { email: "todelete@vitest.local" },
      adminId
    );

    const res = await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    // La ligne existe toujours (références FK préservées) mais est marquée supprimée
    const deleted = await prisma.user.findUnique({ where: { id: member.id } });
    expect(deleted).not.toBeNull();
    expect(deleted?.deletedAt).not.toBeNull();
    // L'email a été anonymisé pour libérer la contrainte d'unicité
    expect(deleted?.email).not.toBe("todelete@vitest.local");
    expect(deleted?.email).toContain("todelete@vitest.local");
  });

  it("le membre supprimé n'apparaît plus dans la liste", async () => {
    const member = await createTestMember(
      { email: "gone@vitest.local" },
      adminId
    );

    await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${adminToken}`);

    const ids = (res.body.members as { id: string }[]).map((m) => m.id);
    expect(ids).not.toContain(member.id);
  });

  it("révoque les sessions du membre supprimé", async () => {
    const member = await createTestMember(
      { email: "revoke-on-delete@vitest.local" },
      adminId
    );
    // Session active simulée
    await prisma.refreshToken.create({
      data: {
        jti: `jti-${Date.now()}`,
        userId: member.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const active = await prisma.refreshToken.count({
      where: { userId: member.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it("permet de recréer un membre avec l'email d'un membre supprimé", async () => {
    const member = await createTestMember(
      { email: "reusable@vitest.local" },
      adminId
    );
    await request(app)
      .delete(`/api/members/${member.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Nouveau",
        email: "reusable@vitest.local",
        password: "Password1!",
        role: "MEMBER",
      });

    expect(res.status).toBe(201);
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
