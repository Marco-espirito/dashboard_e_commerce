import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes";
import memberRoutes from "./routes/members.routes";
import statsRoutes from "./routes/stats.routes";
import orderRoutes from "./routes/orders.routes";
import productRoutes from "./routes/products.routes";
import purchaseRoutes from "./routes/purchases.routes";
import notificationRoutes from "./routes/notifications.routes";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Sécurité de base
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Anti brute-force sur les routes d'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez plus tard" },
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/notifications", notificationRoutes);
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
