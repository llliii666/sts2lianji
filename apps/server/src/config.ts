import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  publicOrigin: string;
  webDistDir: string;
}

export function readConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? path.resolve(thisDir, "../../../data/dev.sqlite"),
    publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:5173",
    webDistDir: process.env.WEB_DIST_DIR ?? path.resolve(thisDir, "../../web/dist"),
  };
}
