ALTER TABLE "Product" ADD COLUMN "initialStock" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product"
SET "initialStock" = "stock" + COALESCE((
  SELECT SUM("quantity")
  FROM "OrderItem"
  WHERE "OrderItem"."productId" = "Product"."id"
), 0);
