import { defineConfig } from '@prisma/client';

export default defineConfig({
  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/z0-auth',
  },
});
