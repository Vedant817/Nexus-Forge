import "dotenv/config";
import { defineConfig } from "prisma/config";

// The connection URL always comes from DATABASE_URL (.env locally, platform
// env on Vercel). It is never hardcoded here.
const OFFLINE_COMMANDS = new Set(["generate", "validate", "format"]);

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  const invoked = process.argv.slice(2).join(" ").trim();
  const command = invoked.split(/\s+/)[0] ?? "";
  if (OFFLINE_COMMANDS.has(command)) {
    // `generate`/`validate`/`format` never connect. `offline.invalid` is
    // unresolvable by design, so even accidental use fails closed instead of
    // touching a wrong database. This keeps Vercel builds working when env
    // is not attached at config-evaluation time.
    return "postgresql://offline.invalid:5432/nexus_forge?schema=public";
  }
  throw new Error(
    "DATABASE_URL is not set. Set it in .env or your hosting platform's environment variables.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
