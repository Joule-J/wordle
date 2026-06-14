import "./env.js";

let prismaClientPromise = null;

export async function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaClientPromise) {
    prismaClientPromise = import("@prisma/client").then(({ PrismaClient }) => {
      const client = globalThis.__wordlePrismaClient || new PrismaClient();
      if (process.env.NODE_ENV !== "production") {
        globalThis.__wordlePrismaClient = client;
      }
      return client;
    });
  }

  return prismaClientPromise;
}

