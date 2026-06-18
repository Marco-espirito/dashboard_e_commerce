import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  makeAdminToken,
} from "../../test/helpers";

// ─── Helpers locaux ───────────────────────────────────────────────────────────

// En-tête anti-CSRF requis par le serveur sur /refresh et /logout
const CSRF_HEADER = "X-Requested-With";
const CSRF_VALUE = "XMLHttpRequest";

function parseCookies(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function getCookie(headers: string[], name: string): string | undefined {
  for (const header of headers) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}

async function loginAndGetCookie(): Promise<{ cookie: string; accessToken: string }> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  expect(res.status).toBe(200);
  const token = getCookie(parseCookies(res.headers["set-cookie"]), "refreshToken");
  expect(token).toBeDefined();
  return { cookie: `refreshToken=${token}`, accessToken: res.body.token };
}

/** Remet à zéro le compteur d'échecs de l'admin de test. */
async function resetAdminLockout() {
  await prisma.user.updateMany({
    where: { email: TEST_ADMIN_EMAIL },
    data: { loginAttempts: 0, lockedUntil: null },
  });
}

// ─── Nettoyage entre tests ────────────────────────────────────────────────────

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await resetAdminLockout();
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("retourne 200 avec token + cookie refreshToken", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toMatchObject({ email: TEST_ADMIN_EMAIL, role: "ADMIN" });
    expect(res.body.user).not.toHaveProperty("password");

    const setCookies = parseCookies(res.headers["set-cookie"]);
    expect(getCookie(setCookies, "refreshToken")).toBeDefined();
  });

  it("enregistre le refresh token en base", async () => {
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    const stored = await prisma.refreshToken.findFirst({ where: { userId: admin!.id } });
    expect(stored).not.toBeNull();
    expect(stored?.revokedAt).toBeNull();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("réinitialise le compteur d'échecs après une connexion réussie", async () => {
    // Simuler 2 échecs préalables
    await prisma.user.updateMany({
      where: { email: TEST_ADMIN_EMAIL },
      data: { loginAttempts: 2 },
    });

    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    const user = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    expect(user?.loginAttempts).toBe(0);
    expect(user?.lockedUntil).toBeNull();
  });

  it("retourne 401 avec un mot de passe incorrect", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "mauvais-mdp" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Identifiants incorrects/);
  });

  it("incrémente le compteur d'échecs à chaque mauvais mot de passe", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux1" });
    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux2" });

    const user = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    expect(user?.loginAttempts).toBe(2);
    expect(user?.lockedUntil).toBeNull(); // pas encore bloqué
  });

  it("indique le nombre de tentatives restantes dans le message d'erreur", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux" });

    expect(res.status).toBe(401);
    // 1 échec → 2 tentatives restantes
    expect(res.body.error).toMatch(/2 tentatives? restantes?/i);
  });

  it("bloque le compte après 3 échecs consécutifs (retourne 429)", async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_ADMIN_EMAIL, password: "mauvais" });
    }

    const user = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    expect(user?.lockedUntil).not.toBeNull();
    expect(user?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("retourne 429 sur la 3e tentative échouée", async () => {
    // 2 premiers échecs
    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux" });
    await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux" });

    // 3e échec → 429
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: "faux" });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/bloqué/i);
  });

  it("refuse la connexion (même correct) quand le compte est verrouillé", async () => {
    // Verrouiller manuellement
    await prisma.user.updateMany({
      where: { email: TEST_ADMIN_EMAIL },
      data: {
        loginAttempts: 3,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/bloqué/i);
  });

  it("indique le temps restant dans le message de blocage", async () => {
    await prisma.user.updateMany({
      where: { email: TEST_ADMIN_EMAIL },
      data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/10 minutes?/i);
  });

  it("retourne 401 avec un email inexistant (sans leaker d'info)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inexistant@test.com", password: "nimporte" });

    expect(res.status).toBe(401);
    // Le message doit être identique à celui d'un mauvais mot de passe
    expect(res.body.error).toBe("Identifiants incorrects");
  });

  it("retourne 400 si email manquant", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: "pwd" });
    expect(res.status).toBe(400);
  });

  it("retourne 400 si email malformé", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "pas-un-email", password: "pwd" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  it("retourne 200 avec un nouvel access token quand le cookie est valide", async () => {
    const { cookie } = await loginAndGetCookie();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .set(CSRF_HEADER, CSRF_VALUE);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  it("effectue la rotation — révoque l'ancien jti, crée un nouveau", async () => {
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    const { cookie } = await loginAndGetCookie();

    const before = await prisma.refreshToken.findFirst({ where: { userId: admin!.id } });
    await request(app).post("/api/auth/refresh").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);

    const after = await prisma.refreshToken.findUnique({ where: { jti: before!.jti } });
    expect(after?.revokedAt).not.toBeNull();

    const active = await prisma.refreshToken.count({
      where: { userId: admin!.id, revokedAt: null },
    });
    expect(active).toBe(1);
  });

  it("bloque la réutilisation d'un token après rotation (token replay)", async () => {
    const { cookie } = await loginAndGetCookie();
    await request(app).post("/api/auth/refresh").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);
    expect(res.status).toBe(401);
  });

  it("retourne 401 sans cookie", async () => {
    const res = await request(app).post("/api/auth/refresh").set(CSRF_HEADER, CSRF_VALUE);
    expect(res.status).toBe(401);
  });

  it("retourne 401 si signature falsifiée", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refreshToken=header.payload.fakesig")
      .set(CSRF_HEADER, CSRF_VALUE);
    expect(res.status).toBe(401);
  });

  it("retourne 403 sans en-tête anti-CSRF", async () => {
    const { cookie } = await loginAndGetCookie();
    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("retourne 200 et efface le cookie", async () => {
    const { cookie } = await loginAndGetCookie();
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);

    expect(res.status).toBe(200);
    const cleared = parseCookies(res.headers["set-cookie"]).find((c) =>
      c.startsWith("refreshToken=")
    );
    expect(cleared).toMatch(/Max-Age=0|Expires=.*1970/i);
  });

  it("révoque le token en base (vrai logout serveur-side)", async () => {
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    const { cookie } = await loginAndGetCookie();

    await request(app).post("/api/auth/logout").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);

    const active = await prisma.refreshToken.count({
      where: { userId: admin!.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it("le refresh échoue après un logout (token révoqué)", async () => {
    const { cookie } = await loginAndGetCookie();
    await request(app).post("/api/auth/logout").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie).set(CSRF_HEADER, CSRF_VALUE);
    expect(res.status).toBe(401);
  });

  it("retourne 200 sans cookie (idempotent)", async () => {
    const res = await request(app).post("/api/auth/logout").set(CSRF_HEADER, CSRF_VALUE);
    expect(res.status).toBe(200);
  });

  it("retourne 403 sans en-tête anti-CSRF", async () => {
    const { cookie } = await loginAndGetCookie();
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("retourne l'utilisateur courant avec un token valide", async () => {
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
    const token = makeAdminToken(admin!.id);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: TEST_ADMIN_EMAIL, role: "ADMIN" });
    expect(res.body.user).not.toHaveProperty("password");
    // Les champs sensibles de sécurité ne doivent pas être exposés
    expect(res.body.user).not.toHaveProperty("loginAttempts");
    expect(res.body.user).not.toHaveProperty("lockedUntil");
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
