import "dotenv/config";

import { defineConfig } from "prisma/config";

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const connectionUrl = directUrl || databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(connectionUrl ? { datasource: { url: connectionUrl } } : {})
});
