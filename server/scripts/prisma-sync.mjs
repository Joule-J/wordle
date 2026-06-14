import { spawnSync } from "node:child_process";
import "../src/env.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping Prisma sync: DATABASE_URL is not set.");
  process.exit(0);
}

const result = spawnSync("prisma", ["db", "push", "--accept-data-loss"], {
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);
