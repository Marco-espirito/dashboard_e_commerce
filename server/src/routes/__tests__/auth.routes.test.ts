import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  makeAdminToken,
} from "../../test/helpers";

// ─── Helpers locaux ───────────────────────────────────────────────────────────

/** Normalise l'en-tête set-cookie en tableau (supertest peut renvoyer string | string[]). */
function parseCookies(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Extrait la valeur d'un cookie Set-Cookie par son nom. */
function getCookie(headers: string[], name: string): string | undefined {
  for (const header of headers) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("retourne 200 avec token + cookie refreshToken", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toMatchObject({ email: TEST_ADMIN_EMAIL, role: "ADMIN" });

    const setCookies: string[] = parseCookies(res.headers["set-cookie"]);
    expect(getCookie(setCookies, "refreshToken")).toBeDefined();
  });

  it("retourne 401 avec un mot de passe incorrect", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "mauvais-mdp" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retourne 401 avec un email inexistant", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inexistant@test.com", password: "nimporte" });

    expect(res.status).toBe(401);
  });

  it("retourne 400 si email manquant", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "monpassword" });

    expect(res.status).toBe(400);
  });

  it("retourne 400 si email malformé", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "pas-un-email", password: "monpassword" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("retourne 400 si le corps est vide", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  let refreshCookie: string;

  beforeAll(async () => {
    // Obtenir un refresh token valide via le login
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    const setCookies: string[] = parseCookies(res.headers["set-cookie"]);
    const token = getCookie(setCookies, "refreshToken");
    expect(token).toBeDefined();
    refreshCookie = `refreshToken=${token}`;
  });

  it("retourne 200 avec un nouvel access token quand le cookie est valide", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
  });

  it("effectue la rotation du refresh token (nouveau cookie émis)", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    const setCookies: string[] = parseCookies(res.headers["set-cookie"]);
    const newToken = getCookie(setCookies, "refreshToken");
    // Un nouveau refreshToken doit être émis (rotation)
    expect(newToken).toBeDefined();
  });

  it("retourne 401 si aucun cookie n'est envoyé", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("retourne 401 si le cookie est invalide (token falsifié)", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refreshToken=token.invalide.ici");

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("retourne 200 et efface le cookie refreshToken", async () => {
    // D'abord se connecter pour obtenir un cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    const setCookiesLogin = parseCookies(loginRes.headers["set-cookie"]);
    const token = getCookie(setCookiesLogin, "refreshToken");
    const cookie = `refreshToken=${token}`;

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    // Le cookie doit être vidé (Max-Age=0 ou Expires dans le passé)
    const setCookies: string[] = parseCookies(res.headers["set-cookie"]);
    const clearedCookie = setCookies.find((c) => c.startsWith("refreshToken="));
    expect(clearedCookie).toBeDefined();
    // supertest retourne la valeur vide ou "Max-Age=0"
    expect(clearedCookie).toMatch(/Max-Age=0|Expires=.*1970/i);
  });

  it("retourne 200 même sans cookie (idempotent)", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  let adminId: string;
  let adminToken: string;

  beforeAll(async () => {
    const user = await prisma.user.findUnique({
      where: { email: TEST_ADMIN_EMAIL },
      select: { id: true },
    });
    adminId = user!.id;
    adminToken = makeAdminToken(adminId);
  });

  it("retourne l'utilisateur courant avec un token valide", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: adminId,
      email: TEST_ADMIN_EMAIL,
      role: "ADMIN",
    });
    // Le mot de passe ne doit jamais être exposé
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("retourne 401 avec un token malformé", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer token.faux.ici");

    expect(res.status).toBe(401);
  });
});
