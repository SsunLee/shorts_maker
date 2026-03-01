import { PrismaClient } from "@prisma/client";

declare global {
  var __shortsMakerPrisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient | undefined {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }
  const cached = globalThis.__shortsMakerPrisma__;
  if (cached) {
    return cached;
  }
  const client = new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__shortsMakerPrisma__ = client;
  }
  return client;
}

export const prisma = createPrismaClient();

