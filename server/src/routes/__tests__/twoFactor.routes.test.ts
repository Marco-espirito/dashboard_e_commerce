import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { makeAdminToken } from "../../test/helpers";

// ─── Utilisateur de test dédié (n'affecte pas l'admin partagé) ────────────────

const TF_EMAIL = "twofactor@vitest.local";
const TF_PASSWORD = "Password1!";

let userId: string;
let token: string; // access token pour les routes de gestion

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: TF_EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: "TwoFactor User",
      email: TF_EMAIL,
      password: await bcrypt.hash(TF_PASSWORD, 10),
      role: "ADMIN",
    },
  });
  userId = user.id;
  token = makeAdminToken(user.id);
});

/** Récupère le secret stocké et génère un code TOTP valide. */
async function currentCode(): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true } });
  return authenticator.generate(u!.totpSecret!);
}

/** Active la 2FA de bout en bout (setup + enable). */
async function enableTwoFactor() {
  await request(app).post("/api/auth/2fa/setup").set("Authorization", `Bearer ${token}`);
  await request(app)
    .post("/api/auth/2fa/enable")
    .set("Authorization", `Bearer ${token}`)
    .send({ code: await currentCode() });
}

// ─── Gestion de la 2FA ─────────────────────────────────────────────────────────

describe("Gestion 2FA", () => {
  it("GET /status retourne enabled: false par défaut", async () => {
    const res = await request(app)
      .get("/api/auth/2fa/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it("POST /setup retourne un QR code et stocke le secret", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/setup")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(res.body.otpauthUrl).toContain("otpauth://totp/");

    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.totpSecret).toBeTruthy();
    expect(u?.totpEnabled).toBe(false); // pas encore activé
  });

  it("POST /enable avec un code valide active la 2FA", async () => {
    await request(app).post("/api/auth/2fa/setup").set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: await currentCode() });

    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.totpEnabled).toBe(true);
  });

  it("POST /enable avec un code invalide retourne 400", async () => {
    await request(app).post("/api/auth/2fa/setup").set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" });

    expect(res.status).toBe(400);
  });

  it("POST /enable sans setup préalable retourne 400", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
  });

  it("POST /disable désactive la 2FA et efface le secret", async () => {
    await enableTwoFactor();

    const res = await request(app)
      .post("/api/auth/2fa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: await currentCode() });

    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.totpEnabled).toBe(false);
    expect(u?.totpSecret).toBeNull();
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/auth/2fa/status");
    expect(res.status).toBe(401);
  });
});

// ─── Login avec 2FA ────────────────────────────────────────────────────────────

describe("Login avec 2FA", () => {
  it("le login renvoie un challenge (pas de token) quand la 2FA est active", async () => {
    await enableTwoFactor();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TF_EMAIL, password: TF_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.token).toBeUndefined(); // pas d'access token à ce stade
    expect(res.headers["set-cookie"]).toBeUndefined(); // pas de refresh cookie
  });

  it("POST /login/2fa finalise la connexion avec un code valide", async () => {
    await enableTwoFactor();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: TF_EMAIL, password: TF_PASSWORD });

    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({ challengeToken: login.body.challengeToken, code: await currentCode() });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: TF_EMAIL });
    const setCookie = res.headers["set-cookie"];
    expect(Array.isArray(setCookie) ? setCookie.join() : setCookie).toMatch(/refreshToken=/);
  });

  it("POST /login/2fa avec un code invalide retourne 401", async () => {
    await enableTwoFactor();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: TF_EMAIL, password: TF_PASSWORD });

    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({ challengeToken: login.body.challengeToken, code: "000000" });

    expect(res.status).toBe(401);
  });

  it("POST /login/2fa avec un challenge invalide retourne 401", async () => {
    const res = await request(app)
      .post("/api/auth/login/2fa")
      .send({ challengeToken: "faux.token.invalide", code: "123456" });
    expect(res.status).toBe(401);
  });

  it("le login normal fonctionne toujours sans 2FA", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TF_EMAIL, password: TF_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.twoFactorRequired).toBeUndefined();
  });
});
