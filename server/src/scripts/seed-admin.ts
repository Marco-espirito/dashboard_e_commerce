import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Admin1234!";
  const name = process.env.ADMIN_NAME || "Super Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`ℹ️  L'admin existe déjà : ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, name, password: hashed, role: "ADMIN" },
  });

  console.log("✅ Admin créé avec succès !");
  console.log(`   Email    : ${email}`);
  console.log(`   Password : ${password}`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
