import { SQL } from "bun";

export function createPgSql(connectionString: string | URL): SQL {
  const configuredMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  const max = Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 100
    ? configuredMax
    : 10;
  return new SQL(connectionString, {
    max,
    idleTimeout: 30,
  });
}
