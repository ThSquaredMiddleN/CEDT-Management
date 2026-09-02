import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`LabSync API listening on http://localhost:${config.PORT}/api/v1`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
