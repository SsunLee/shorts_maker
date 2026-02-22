import { createReadStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { google } from "googleapis";
import { getSettings } from "@/lib/settings-store";

interface UploadArgs {
  title: string;
  description?: string;
  tags?: string[];
  videoUrl: string;
  privacyStatus?: "private" | "public" | "unlisted";
}

async function resolveYoutubeCredentials() {
  const settings = await getSettings();
  const clientId = process.env.YOUTUBE_CLIENT_ID || settings.youtubeClientId;
  const clientSecret =
    process.env.YOUTUBE_CLIENT_SECRET || settings.youtubeClientSecret;
  const redirectUri =
    process.env.YOUTUBE_REDIRECT_URI ||
    settings.youtubeRedirectUri ||
    "http://localhost:3000/oauth2callback";
  const refreshToken =
    process.env.YOUTUBE_REFRESH_TOKEN || settings.youtubeRefreshToken;

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

async function downloadRemoteVideo(videoUrl: string): Promise<string> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Unable to download video from ${videoUrl}`);
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
  const creds = await resolveYoutubeCredentials();
  const auth = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    creds.redirectUri
  );
  auth.setCredentials({ refresh_token: creds.refreshToken });

  const youtube = google.youtube({
    version: "v3",
    auth
  });

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
    throw new Error("YouTube upload failed: no video ID returned.");
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}
