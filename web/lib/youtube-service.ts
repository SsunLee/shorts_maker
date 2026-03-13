import { createReadStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { google } from "googleapis";
import { getSettings } from "@/lib/settings-store";
import { toSignedStorageReadUrl } from "@/lib/object-storage";
import type { AppSettings } from "@/lib/types";

interface UploadArgs {
  title: string;
  description?: string;
  tags?: string[];
  videoUrl: string;
  privacyStatus?: "private" | "public" | "unlisted";
  trace?: {
    source?: string;
    requestPath?: string;
    requestId?: string;
    userId?: string;
    rowId?: string;
    workflowId?: string;
    referer?: string;
  };
}

async function resolveYoutubeCredentials(userId?: string) {
  const settings = await getSettings(userId);
  return resolveYoutubeCredentialsFromSettings(settings);
}

function resolveYoutubeCredentialsFromSettings(settings: Partial<AppSettings>) {
  const clientId = settings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret =
    settings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri =
    settings.youtubeRedirectUri ||
    process.env.YOUTUBE_REDIRECT_URI ||
    "http://localhost:3000/oauth2callback";
  const refreshToken =
    settings.youtubeRefreshToken || process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const missing: string[] = [];
    if (!clientId) {
      missing.push("youtubeClientId");
    }
    if (!clientSecret) {
      missing.push("youtubeClientSecret");
    }
    if (!refreshToken) {
      missing.push("youtubeRefreshToken");
    }
    throw new Error(
      `YouTube OAuth credentials are missing (${missing.join(", ")}). ` +
        "Configure them in /settings or .env."
    );
  }

  return { clientId, clientSecret, redirectUri, refreshToken };
}

function createYoutubeClientFromCreds(creds: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
}) {
  const auth = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    creds.redirectUri
  );
  auth.setCredentials({ refresh_token: creds.refreshToken });

  return google.youtube({
    version: "v3",
    auth
  });
}

async function downloadRemoteVideo(videoUrl: string): Promise<string> {
  const expiresInSec = Number.parseInt(
    String(process.env.YOUTUBE_UPLOAD_ASSET_SIGNED_URL_EXPIRES_SEC || "3600"),
    10
  );
  const safeExpires = Number.isFinite(expiresInSec) ? expiresInSec : 3600;
  const readableUrl = await toSignedStorageReadUrl(videoUrl, safeExpires);
  const response = await fetch(readableUrl);
  if (!response.ok) {
    throw new Error(`Unable to download video from ${videoUrl} (HTTP ${response.status})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `shorts-maker-${crypto.randomUUID()}.mp4`);
  await fs.writeFile(tempPath, bytes);
  return tempPath;
}

async function resolveUploadPath(videoUrl: string): Promise<string> {
  if (/^https?:\/\//.test(videoUrl)) {
    return downloadRemoteVideo(videoUrl);
  }

  if (videoUrl.startsWith("/")) {
    return path.join(process.cwd(), "public", videoUrl.replace(/^\//, ""));
  }

  return videoUrl;
}

/** Upload an MP4 to YouTube and return the final watch URL. */
export async function uploadVideoToYoutube(args: UploadArgs): Promise<string> {
  const trace = {
    source: args.trace?.source || "unknown",
    requestPath: args.trace?.requestPath || "",
    requestId: args.trace?.requestId || "",
    userId: args.trace?.userId || "",
    rowId: args.trace?.rowId || "",
    workflowId: args.trace?.workflowId || "",
    referer: args.trace?.referer || ""
  };
  const startedAt = Date.now();
  console.info(
    `[youtube-upload:start] source=${trace.source} path=${trace.requestPath} requestId=${trace.requestId} userId=${trace.userId} rowId=${trace.rowId} workflowId=${trace.workflowId} title="${args.title}" privacy=${args.privacyStatus || "private"} videoUrl=${args.videoUrl}`
  );

  const creds = await resolveYoutubeCredentials(trace.userId || undefined);
  const youtube = createYoutubeClientFromCreds(creds);

  const uploadPath = await resolveUploadPath(args.videoUrl);
  let response;
  try {
    response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: args.title,
          description: args.description || "",
          tags: args.tags || []
        },
        status: {
          privacyStatus: args.privacyStatus || "private"
        }
      },
      media: {
        body: createReadStream(uploadPath)
      }
    });
  } catch (error) {
    console.error(
      `[youtube-upload:error] source=${trace.source} path=${trace.requestPath} requestId=${trace.requestId} userId=${trace.userId} rowId=${trace.rowId} workflowId=${trace.workflowId} elapsedMs=${Date.now() - startedAt} message=${error instanceof Error ? error.message : String(error)}`
    );
    const message =
      error instanceof Error ? error.message : "YouTube upload failed.";
    const details =
      typeof error === "object" && error !== null
        ? (error as { response?: { data?: { error?: string; error_description?: string } } })
            .response?.data
        : undefined;
    const oauthError = String(details?.error || "").toLowerCase();
    const oauthDesc = String(details?.error_description || "");
    if (oauthError === "unauthorized_client" || message.includes("unauthorized_client")) {
      throw new Error(
        "YouTube OAuth unauthorized_client: refresh token and client ID/secret pair do not match. " +
          "Re-issue refresh token with the same OAuth client in Google OAuth Playground " +
          "(Use your own OAuth credentials)."
      );
    }
    if (oauthDesc) {
      throw new Error(`${message}: ${oauthDesc}`);
    }
    throw new Error(message);
  }

  const videoId = response.data.id;
  if (!videoId) {
    console.error(
      `[youtube-upload:error] source=${trace.source} path=${trace.requestPath} requestId=${trace.requestId} userId=${trace.userId} rowId=${trace.rowId} workflowId=${trace.workflowId} elapsedMs=${Date.now() - startedAt} message=YouTube upload failed: no video ID returned.`
    );
    throw new Error("YouTube upload failed: no video ID returned.");
  }

  console.info(
    `[youtube-upload:done] source=${trace.source} path=${trace.requestPath} requestId=${trace.requestId} userId=${trace.userId} rowId=${trace.rowId} workflowId=${trace.workflowId} elapsedMs=${Date.now() - startedAt} videoId=${videoId}`
  );
  return `https://www.youtube.com/watch?v=${videoId}`;
}
