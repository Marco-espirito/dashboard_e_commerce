/**
 * Fichier de setup Vitest — exécuté une fois avant chaque fichier de test.
 *
 * Il crée l'admin de test (s'il n'existe pas) et nettoie la base avant/après
 * chaque suite, garantissant des tests isolés et reproductibles.
 */
import { beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanDb, createTestAdmin } from "./helpers";

beforeAll(async () => {
  // Nettoyer les résidus d'une exécution précédente, puis préparer les fixtures.
  await cleanDb();
  await createTestAdmin();
});

afterAll(async () => {
  await cleanDb();
  await prisma.$disconnect();
});
