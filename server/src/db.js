import "./env.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prismaClientPromise = null;

function cleanUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

export async function getPrismaClient() {
  const databaseUrl = cleanUrl(process.env.DATABASE_URL);
  if (!databaseUrl) {
    return null;
  }

  if (!prismaClientPromise) {
    prismaClientPromise = import("@prisma/client").then(({ PrismaClient }) => {
      const adapter = new PrismaPg({
        connectionString: databaseUrl
      });
      const client = globalThis.__wordlePrismaClient || new PrismaClient({ adapter });
      if (process.env.NODE_ENV !== "production") {
        globalThis.__wordlePrismaClient = client;
      }
      return client;
    });
  }

  return prismaClientPromise;
}
