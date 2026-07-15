import { SQL } from "bun";

import { loadConfig } from "./config";

export function createPgSql(connectionString: string | URL): SQL {
  const max = loadConfig().databasePoolMax;
  return new SQL(connectionString, {
    max,
    idleTimeout: 30,
  });
}
