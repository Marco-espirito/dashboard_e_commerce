import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditEntity = "PRODUCT" | "MEMBER";

export type AuthEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "ACCOUNT_LOCKED";

/** Extrait l'IP cliente (en tenant compte d'un éventuel proxy) et le user-agent. */
export function extractClientInfo(req: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ??
    req.socket.remoteAddress ??
    null;
  const userAgent = req.headers["user-agent"] ?? null;
  return { ipAddress, userAgent };
}

interface LogAuthEventParams {
  type: AuthEventType;
  email: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Enregistre un événement d'authentification (login/logout/lockout).
 * Best-effort : n'interrompt jamais le flux d'authentification.
 */
export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        type: params.type,
        email: params.email,
        userId: params.userId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, params }, "Échec écriture auth event");
  }
}

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
