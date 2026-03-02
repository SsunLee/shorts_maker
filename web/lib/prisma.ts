import { PrismaClient } from "@prisma/client";

declare global {
  var __shortsMakerPrisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient | undefined {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }
  if (!globalThis.__shortsMakerPrisma__) {
    globalThis.__shortsMakerPrisma__ = new PrismaClient();
  }
  return globalThis.__shortsMakerPrisma__;
}

export const prisma = createPrismaClient();

