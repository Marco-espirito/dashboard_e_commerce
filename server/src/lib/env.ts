import { z } from "zod";

const envSchema = z.object({
  // Base de données
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL est requis" })
    .url("DATABASE_URL doit être une URL valide"),

  // JWT
  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET est requis" })
    .min(16, "JWT_SECRET doit faire au moins 16 caractères"),

  JWT_EXPIRES_IN: z.string().default("15m"),

  REFRESH_SECRET: z.string().optional(),

  // Serveur
  PORT: z.coerce.number().int().positive().default(4000),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5174"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error("\n❌ Variables d'environnement invalides :\n");
    console.error(errors);
    console.error("\nVérifie ton fichier .env (voir .env.example)\n");
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
