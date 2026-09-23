import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` never connects to the database, so it must work without
// DATABASE_URL (e.g. Vercel build evaluating config before env is attached).
// The placeholder is never used for a real connection: `migrate deploy` and
// the runtime fail closed against it, forcing the real URL to be configured.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/nexus_forge?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
