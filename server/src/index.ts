import "dotenv/config";
import { app } from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `Serveur démarré`);
});
