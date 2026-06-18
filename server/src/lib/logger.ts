import pino from "pino";
import { env } from "./env";

const isDev = env.NODE_ENV !== "production";

/**
 * Logger partagé pour tout le serveur.
 *
 * En développement  → sortie colorée et lisible via pino-pretty
 * En production     → JSON pur (compatible avec Datadog, Loki, CloudWatch…)
 */
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
});
