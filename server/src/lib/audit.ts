import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditEntity = "PRODUCT" | "MEMBER";

interface LogAuditParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  userId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Enregistre une entrée dans le journal d'audit.
 * Best-effort : une erreur d'écriture ne bloque pas la réponse principale.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        entityLabel: params.entityLabel,
        userId: params.userId,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (err) {
    // On log l'erreur mais on ne la propage pas — l'audit ne doit jamais
    // faire échouer l'opération métier principale.
    logger.error({ err, params }, "Échec écriture audit log");
  }
}

/**
 * Calcule le diff entre deux objets et retourne uniquement les champs modifiés
 * sous la forme { field: { from: oldVal, to: newVal } }.
 */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Prisma.InputJsonValue {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }

  return diff as Prisma.InputJsonValue;
}
