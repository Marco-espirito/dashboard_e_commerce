/**
 * Fichier de setup Vitest — exécuté une fois PAR FICHIER de test.
 *
 * Important : avec singleFork:true, setupFiles s'exécute pour chaque fichier
 * test dans le même process. On NE PAS appeler prisma.$disconnect() ici —
 * cela couperait la connexion entre les fichiers et rendrait Prisma instable.
 * Vitest ferme le process à la fin, ce qui déconnecte proprement.
 */
import { beforeAll, afterAll } from "vitest";
import { cleanDb, createTestAdmin } from "./helpers";

beforeAll(async () => {
  // Partir d'un état propre pour chaque fichier de test
  await cleanDb();
  await createTestAdmin();
});

afterAll(async () => {
  // Nettoyer les données créées pendant ce fichier de test.
  // PAS de prisma.$disconnect() — la connexion doit rester ouverte
  // pour les fichiers de test suivants (le process se ferme proprement après).
  await cleanDb();
});
