import "dotenv/config";

import { defineConfig } from "prisma/config";

function cleanUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

const directUrl = cleanUrl(process.env.DIRECT_URL);
const databaseUrl = cleanUrl(process.env.DATABASE_URL);
const connectionUrl = directUrl || databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(connectionUrl ? { datasource: { url: connectionUrl } } : {})
});
