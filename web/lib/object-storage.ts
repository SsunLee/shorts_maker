import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";

type StorageResult = {
  publicUrl: string;
  localPath?: string;
};

export interface S3StoredAsset {
  key: string;
  publicUrl: string;
  size: number;
  lastModified?: string;
}

export interface S3JobAssetSummary {
  jobId: string;
  assetCount: number;
  generatedCount: number;
  renderedCount: number;
  totalSizeBytes: number;
  lastModified?: string;
}

interface S3Config {
  enabled: boolean;
  bucket?: string;
  region?: string;
  prefix: string;
  publicBaseUrl?: string;
}

let cachedClient: S3Client | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizePrefix(raw: string | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function getS3Config(): S3Config {
  const bucket = String(process.env.S3_BUCKET || "").trim();
  const region = String(process.env.S3_REGION || "").trim() || "us-east-1";
  const prefix = normalizePrefix(process.env.S3_PREFIX || "shorts-maker");
  const publicBaseUrl =
    String(process.env.S3_PUBLIC_BASE_URL || "").trim() ||
    (bucket ? `https://${bucket}.s3.${region}.amazonaws.com` : undefined);

  return {
    enabled: Boolean(bucket),
    bucket: bucket || undefined,
    region,
    prefix,
    publicBaseUrl
  };
}

function getS3Client(config: S3Config): S3Client {
  if (cachedClient) {
    return cachedClient;
  }
  cachedClient = new S3Client({
    region: config.region
  });
  return cachedClient;
}

function joinKey(config: S3Config, key: string): string {
  const normalized = String(key || "")
    .replace(/^\/+/, "")
    .trim();
  if (!config.prefix) {
    return normalized;
  }
  return `${config.prefix}/${normalized}`;
}

function toRelativeStoragePath(config: S3Config, key: string): string {
  const normalized = String(key || "").trim().replace(/^\/+/, "");
  if (!normalized || !config.prefix) {
    return normalized;
  }
  if (normalized === config.prefix) {
    return "";
  }
  const prefixWithSlash = `${config.prefix}/`;
  if (normalized.startsWith(prefixWithSlash)) {
    return normalized.slice(prefixWithSlash.length);
  }
  return normalized;
}

function encodePathForUrl(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toPublicUrl(config: S3Config, key: string): string {
  const base = String(config.publicBaseUrl || "").replace(/\/+$/, "");
  return `${base}/${encodePathForUrl(key)}`;
}

function guessContentType(fileName: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  if (ext === ".mp3") {
    return "audio/mpeg";
  }
  if (ext === ".wav") {
    return "audio/wav";
  }
  if (ext === ".ogg") {
    return "audio/ogg";
  }
  if (ext === ".mp4") {
    return "video/mp4";
  }
  if (ext === ".srt") {
    return "application/x-subrip";
  }
  return fallback;
}

export function isS3StorageEnabled(): boolean {
  return getS3Config().enabled;
}

export async function storeGeneratedAsset(args: {
  jobId: string;
  fileName: string;
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
}): Promise<StorageResult> {
  const config = getS3Config();
  const relativePath = `generated/${args.jobId}/${args.fileName}`;

  if (!config.enabled) {
    const outputDir = path.join(process.cwd(), "public", "generated", args.jobId);
    await fs.mkdir(outputDir, { recursive: true });
    const localPath = path.join(outputDir, args.fileName);
    await fs.writeFile(localPath, Buffer.from(args.body));
    return {
      localPath,
      publicUrl: `/generated/${args.jobId}/${args.fileName}`
    };
  }

  const objectKey = joinKey(config, relativePath);
  const client = getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: Buffer.from(args.body),
      ContentType: args.contentType || guessContentType(args.fileName),
      CacheControl: args.cacheControl || "public, max-age=31536000, immutable"
    })
  );

  return {
    publicUrl: toPublicUrl(config, objectKey)
  };
}

export async function storeGeneratedAssetFromRemote(args: {
  jobId: string;
  fileName: string;
  sourceUrl: string;
  contentType?: string;
  cacheControl?: string;
}): Promise<StorageResult> {
  const response = await fetch(args.sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to download remote asset: ${args.sourceUrl}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  const responseContentType = response.headers.get("content-type") || undefined;
  return storeGeneratedAsset({
    jobId: args.jobId,
    fileName: args.fileName,
    body,
    contentType: args.contentType || responseContentType,
    cacheControl: args.cacheControl
  });
}

export async function mirrorRenderedVideoToStorage(args: {
  jobId: string;
  sourceUrl?: string;
}): Promise<string | undefined> {
  const sourceUrl = String(args.sourceUrl || "").trim();
  if (!sourceUrl) {
    return undefined;
  }

  const config = getS3Config();
  if (!config.enabled) {
    return sourceUrl;
  }

  const relativePath = `rendered/${args.jobId}/final.mp4`;
  const objectKey = joinKey(config, relativePath);
  const targetUrl = toPublicUrl(config, objectKey);
  if (sourceUrl === targetUrl) {
    return sourceUrl;
  }

  const retryableStatuses = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
  let response: Response | undefined;
  let lastStatus: number | undefined;
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetch(sourceUrl, { cache: "no-store" });
    if (response.ok) {
      break;
    }
    lastStatus = response.status;
    if (!retryableStatuses.has(response.status) || attempt === maxAttempts) {
      break;
    }
    await sleep(Math.min(2500, attempt * 350));
  }
  if (!response || !response.ok) {
    throw new Error(
      `Unable to download rendered video from ${sourceUrl}` +
        (lastStatus ? ` (HTTP ${lastStatus})` : "")
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  const client = getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: "video/mp4",
      CacheControl: "public, max-age=604800"
    })
  );
  return targetUrl;
}

async function deleteByPrefix(config: S3Config, relativePrefix: string): Promise<void> {
  if (!config.enabled || !config.bucket) {
    return;
  }
  const keyPrefix = joinKey(config, relativePrefix).replace(/\/+$/, "") + "/";
  const client = getS3Client(config);

  let continuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: keyPrefix,
        ContinuationToken: continuationToken
      })
    );

    const keys =
      listed.Contents?.map((item) => item.Key).filter((item): item is string => Boolean(item)) ||
      [];
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
            Quiet: true
          }
        })
      );
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function listByPrefix(config: S3Config, relativePrefix: string): Promise<S3StoredAsset[]> {
  if (!config.enabled || !config.bucket) {
    return [];
  }
  const keyPrefix = joinKey(config, relativePrefix).replace(/\/+$/, "") + "/";
  const client = getS3Client(config);
  const items: S3StoredAsset[] = [];

  let continuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: keyPrefix,
        ContinuationToken: continuationToken
      })
    );

    (listed.Contents || []).forEach((entry) => {
      const key = String(entry.Key || "").trim();
      if (!key) {
        return;
      }
      items.push({
        key,
        publicUrl: toPublicUrl(config, key),
        size: Number(entry.Size || 0),
        lastModified: entry.LastModified ? entry.LastModified.toISOString() : undefined
      });
    });

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

export async function listJobAssetsFromStorage(jobId: string): Promise<{
  enabled: boolean;
  bucket?: string;
  assets: S3StoredAsset[];
  totalSizeBytes: number;
}> {
  const normalizedJobId = String(jobId || "").trim();
  if (!normalizedJobId) {
    return {
      enabled: false,
      assets: [],
      totalSizeBytes: 0
    };
  }

  const config = getS3Config();
  if (!config.enabled) {
    return {
      enabled: false,
      assets: [],
      totalSizeBytes: 0
    };
  }

  const grouped = await Promise.all([
    listByPrefix(config, `generated/${normalizedJobId}`),
    listByPrefix(config, `generated/${normalizedJobId}-preview`),
    listByPrefix(config, `generated/${normalizedJobId}-final`),
    listByPrefix(config, `rendered/${normalizedJobId}`),
    listByPrefix(config, `rendered/${normalizedJobId}-preview`),
    listByPrefix(config, `rendered/${normalizedJobId}-final`)
  ]);
  const dedup = new Map<string, S3StoredAsset>();
  grouped.flat().forEach((item) => dedup.set(item.key, item));
  const assets = Array.from(dedup.values()).sort((a, b) => a.key.localeCompare(b.key));
  const totalSizeBytes = assets.reduce((sum, item) => sum + item.size, 0);

  return {
    enabled: true,
    bucket: config.bucket,
    assets,
    totalSizeBytes
  };
}

function parseStorageJobFromRelativeKey(
  relativeKey: string
): { jobId: string; category: "generated" | "rendered" } | undefined {
  const parts = String(relativeKey || "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }
  const category = parts[0];
  if (category !== "generated" && category !== "rendered") {
    return undefined;
  }
  const rawToken = String(parts[1] || "").trim();
  if (!rawToken) {
    return undefined;
  }
  const jobId = rawToken.replace(/-(preview|final)$/i, "").trim();
  if (!jobId) {
    return undefined;
  }
  return {
    jobId,
    category
  };
}

export async function listAllStorageJobAssets(): Promise<{
  enabled: boolean;
  bucket?: string;
  jobs: S3JobAssetSummary[];
  totalAssets: number;
  totalSizeBytes: number;
}> {
  const config = getS3Config();
  if (!config.enabled) {
    return {
      enabled: false,
      jobs: [],
      totalAssets: 0,
      totalSizeBytes: 0
    };
  }

  const [generatedAssets, renderedAssets] = await Promise.all([
    listByPrefix(config, "generated"),
    listByPrefix(config, "rendered")
  ]);
  const dedup = new Map<string, S3StoredAsset>();
  [...generatedAssets, ...renderedAssets].forEach((asset) => {
    dedup.set(asset.key, asset);
  });
  const assets = Array.from(dedup.values());

  const grouped = new Map<string, S3JobAssetSummary & { lastModifiedMs: number }>();
  assets.forEach((asset) => {
    const relativeKey = toRelativeStoragePath(config, asset.key);
    const parsed = parseStorageJobFromRelativeKey(relativeKey);
    if (!parsed) {
      return;
    }
    const current = grouped.get(parsed.jobId) || {
      jobId: parsed.jobId,
      assetCount: 0,
      generatedCount: 0,
      renderedCount: 0,
      totalSizeBytes: 0,
      lastModified: undefined,
      lastModifiedMs: 0
    };
    current.assetCount += 1;
    current.totalSizeBytes += Number(asset.size || 0);
    if (parsed.category === "generated") {
      current.generatedCount += 1;
    } else {
      current.renderedCount += 1;
    }
    const modifiedMs = asset.lastModified ? Date.parse(asset.lastModified) : NaN;
    if (Number.isFinite(modifiedMs) && modifiedMs > current.lastModifiedMs) {
      current.lastModifiedMs = modifiedMs;
      current.lastModified = new Date(modifiedMs).toISOString();
    }
    grouped.set(parsed.jobId, current);
  });

  const jobs = Array.from(grouped.values())
    .sort((a, b) => {
      if (a.lastModifiedMs !== b.lastModifiedMs) {
        return b.lastModifiedMs - a.lastModifiedMs;
      }
      return a.jobId.localeCompare(b.jobId);
    })
    .map((item) => ({
      jobId: item.jobId,
      assetCount: item.assetCount,
      generatedCount: item.generatedCount,
      renderedCount: item.renderedCount,
      totalSizeBytes: item.totalSizeBytes,
      lastModified: item.lastModified
    }));

  return {
    enabled: true,
    bucket: config.bucket,
    jobs,
    totalAssets: assets.length,
    totalSizeBytes: assets.reduce((sum, item) => sum + Number(item.size || 0), 0)
  };
}

export async function cleanupJobAssetsFromStorage(jobId: string): Promise<void> {
  if (!jobId.trim()) {
    return;
  }
  const config = getS3Config();
  if (!config.enabled) {
    return;
  }

  await Promise.all([
    deleteByPrefix(config, `generated/${jobId}`),
    deleteByPrefix(config, `generated/${jobId}-preview`),
    deleteByPrefix(config, `generated/${jobId}-final`),
    deleteByPrefix(config, `rendered/${jobId}`),
    deleteByPrefix(config, `rendered/${jobId}-preview`),
    deleteByPrefix(config, `rendered/${jobId}-final`)
  ]);
}

export async function cleanupSelectedJobAssetsFromStorage(jobIds: string[]): Promise<string[]> {
  const normalized = Array.from(
    new Set(jobIds.map((item) => String(item || "").trim()).filter(Boolean))
  );
  if (normalized.length === 0) {
    return [];
  }
  await Promise.all(normalized.map((jobId) => cleanupJobAssetsFromStorage(jobId)));
  return normalized;
}

export async function cleanupAllAssetsFromStorage(): Promise<void> {
  const config = getS3Config();
  if (!config.enabled) {
    return;
  }
  await Promise.all([deleteByPrefix(config, "generated"), deleteByPrefix(config, "rendered")]);
}
