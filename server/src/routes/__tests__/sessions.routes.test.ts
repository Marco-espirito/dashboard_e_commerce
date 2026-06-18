import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  makeAdminToken,
} from "../../test/helpers";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.updateMany({
    where: { email: TEST_ADMIN_EMAIL },
    data: { loginAttempts: 0, lockedUntil: null },
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function fullLogin() {
  const res = await request(app)
    .post("/api/auth/login")
    .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  expect(res.status).toBe(200);
  return { accessToken: res.body.token as string };
}

// ─── GET /api/auth/sessions ───────────────────────────────────────────────────

describe("GET /api/auth/sessions", () => {
  it("retourne 401 sans token d'accès", async () => {
    const res = await request(app).get("/api/auth/sessions");
    expect(res.status).toBe(401);
  });

  it("retourne la liste des sessions actives", async () => {
    const { accessToken } = await fullLogin();

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(1);
  });

  it("marque la session courante avec isCurrent: true", async () => {
    const { accessToken } = await fullLogin();

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    const current = res.body.sessions.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(current).toBeDefined();
  });

  it("inclut les métadonnées (userAgent, dates) sans exposer le jti brut", async () => {
    const { accessToken } = await fullLogin();

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    const session = res.body.sessions[0];
    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("createdAt");
    expect(session).toHaveProperty("lastUsedAt");
    expect(session).toHaveProperty("expiresAt");
    expect(session.userAgent).toContain("Chrome");
    expect(session).not.toHaveProperty("jti");
  });

  it("n'affiche pas les sessions révoquées", async () => {
    const { accessToken } = await fullLogin();
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });

    await prisma.refreshToken.updateMany({
      where: { userId: admin!.id },
      data: { revokedAt: new Date() },
    });

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.body.sessions).toHaveLength(0);
  });
});

// ─── DELETE /api/auth/sessions/:id ───────────────────────────────────────────

describe("DELETE /api/auth/sessions/:id", () => {
  it("révoque une session spécifique", async () => {
    const { accessToken } = await fullLogin();

    const sessionsRes = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    const sessionId = sessionsRes.body.sessions[0].id as string;

    const res = await request(app)
      .delete(`/api/auth/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    const token = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
    expect(token?.revokedAt).not.toBeNull();
  });

  it("retourne 404 pour un id inexistant", async () => {
    const { accessToken } = await fullLogin();

    const res = await request(app)
      .delete("/api/auth/sessions/id-qui-nexiste-pas")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it("retourne 403 si la session n'appartient pas à l'utilisateur du token", async () => {
    // Créer la session de l'admin via login
    const { accessToken: adminToken } = await fullLogin();

    // Récupérer l'id de la session admin
    const sessionsRes = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${adminToken}`);
    const adminSessionId = sessionsRes.body.sessions[0].id as string;

    // Forger un token JWT avec un userId différent (ne possède pas cette session)
    const foreignToken = makeAdminToken("completely-different-user-id");

    const res = await request(app)
      .delete(`/api/auth/sessions/${adminSessionId}`)
      .set("Authorization", `Bearer ${foreignToken}`);

    expect(res.status).toBe(403);
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app).delete("/api/auth/sessions/quelconque");
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/auth/sessions (tout révoquer) ────────────────────────────────

describe("DELETE /api/auth/sessions (révoquer tout sauf session courante)", () => {
  it("révoque les autres sessions et conserve la session courante", async () => {
    // Créer 3 sessions via 3 connexions successives
    await fullLogin(); // session 1 (ancienne)
    await fullLogin(); // session 2 (ancienne)
    const { accessToken } = await fullLogin(); // session 3 = courante

    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });

    // Vérifier qu'on a bien 3 sessions actives avant
    const totalBefore = await prisma.refreshToken.count({
      where: { userId: admin!.id, revokedAt: null },
    });
    expect(totalBefore).toBe(3);

    const res = await request(app)
      .delete("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.revokedCount).toBe(2);

    // Seule la session courante doit rester active
    const remaining = await prisma.refreshToken.count({
      where: { userId: admin!.id, revokedAt: null },
    });
    expect(remaining).toBe(1);
  });

  it("retourne revokedCount: 0 s'il n'y a aucune autre session", async () => {
    const { accessToken } = await fullLogin();

    const res = await request(app)
      .delete("/api/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.revokedCount).toBe(0);
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app).delete("/api/auth/sessions");
    expect(res.status).toBe(401);
  });
});
