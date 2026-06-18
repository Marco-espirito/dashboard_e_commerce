import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import memberRoutes from "./routes/members.routes";
import statsRoutes from "./routes/stats.routes";
import orderRoutes from "./routes/orders.routes";
import productRoutes from "./routes/products.routes";
import purchaseRoutes from "./routes/purchases.routes";
import notificationRoutes from "./routes/notifications.routes";
import auditRoutes from "./routes/audit.routes";

export const app = express();

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) =>
        req.url === "/api/health" ||
        req.method === "OPTIONS",
    },
    customLogLevel: (_req, res) => {
      if (res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

// ── Sécurité ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// ── Anti brute-force sur le login ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez plus tard" },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit", auditRoutes);

// ── Gestionnaire d'erreurs centralisé (toujours en dernier) ───────────────────
app.use(errorHandler);
