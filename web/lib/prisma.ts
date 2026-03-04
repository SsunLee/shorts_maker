import { PrismaClient } from "@prisma/client";

declare global {
  var __shortsMakerPrisma__: PrismaClient | undefined;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function resolveDatabaseUrlFromEnv(): string | undefined {
  const direct = firstNonEmpty([
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL_NON_POOLING
  ]);
  if (direct) {
    return direct;
  }

  // Support provider integration prefixes, e.g. SSUNEDU_POSTGRES_PRISMA_URL.
  const dynamicCandidateKeys = Object.keys(process.env).filter((key) =>
    /(_POSTGRES_PRISMA_URL|_POSTGRES_URL|_DATABASE_URL|_DATABASE_URL_UNPOOLED|_POSTGRES_URL_NON_POOLING)$/i.test(
      key
    )
  );
  for (const key of dynamicCandidateKeys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function createPrismaClient(): PrismaClient | undefined {
  const databaseUrl = resolveDatabaseUrlFromEnv();
  if (!databaseUrl) {
    return undefined;
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }

  if (!globalThis.__shortsMakerPrisma__) {
    globalThis.__shortsMakerPrisma__ = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
  }
  return globalThis.__shortsMakerPrisma__;
}

export const prisma = createPrismaClient();

