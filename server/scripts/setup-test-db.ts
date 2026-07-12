import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

config({ path: path.join(serverRoot, ".env.test"), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set (expected from server/.env.test)");

const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");

async function ensureDatabase() {
  const maintenanceUrl = new URL(databaseUrl!);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
  await client.end();
}

async function applyMigrations() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  // Reset to a clean slate so every test run starts from the same schema state.
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

  const migrationsDir = path.join(serverRoot, "prisma", "migrations");
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dir of migrationDirs) {
    const sqlPath = path.join(migrationsDir, dir, "migration.sql");
    console.log(`Applying migration: ${dir}`);
    await client.query(readFileSync(sqlPath, "utf-8"));
  }

  await client.end();
}

function seed() {
  const result = spawnSync("bun", ["prisma/seed.ts"], {
    cwd: serverRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("Seeding the test database failed");
}

async function main() {
  await ensureDatabase();
  await applyMigrations();
  seed();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
