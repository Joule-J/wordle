import "./env.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prismaClientPromise = null;

export async function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaClientPromise) {
    prismaClientPromise = import("@prisma/client").then(({ PrismaClient }) => {
      const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL
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
