import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Charger les variables de test AVANT que les modules (env.ts, prisma.ts…) soient importés.
// Vitest évalue ce fichier en premier, ce qui garantit que process.env est alimenté
// avant l'appel à validateEnv() dans lib/env.ts.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Fichier de setup exécuté avant chaque suite de tests
    setupFiles: ["./src/test/setup.ts"],
    // Timeout généreux pour les appels DB
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Exécuter les fichiers de test séquentiellement (évite les conflits DB).
    // fileParallelism: false garantit que les suites se succèdent sans chevauchement
    // (singleFork: true ne suffit pas — les tests s'exécutent quand même en parallèle
    // si plusieurs workers sont disponibles dans le même fork).
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
    // Couverture de code (optionnel : npm run test:coverage)
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/routes/**", "src/middleware/**", "src/lib/**"],
      exclude: ["src/scripts/**", "src/test/**"],
    },
  },
});
