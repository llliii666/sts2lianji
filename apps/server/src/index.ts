import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = await createApp({
  databasePath: config.databasePath,
  publicOrigin: config.publicOrigin,
  webDistDir: config.webDistDir,
  logger: true,
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Slay the Spire 2 lobby listening on http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
