/**
 * Prisma client export
 * Re-exports the enhanced Prisma client as 'prisma' for convenience
 */

import { db } from "./db/client";

// Export the enhanced Prisma client instance
export const prisma = db;
