#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--source" || token === "-s") {
      args.source = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--target" || token === "-t") {
      args.target = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
    }
  }
  return args;
}

function resolveDefaultSource(webRoot) {
  const candidates = [
    "data/settings.dev-3000.json",
    "data/settings.dev-3001.json",
    "data/settings.json"
  ].map((rel) => path.join(webRoot, rel));

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return path.join(webRoot, "data/settings.json");
}

function toEnvValue(raw) {
  const value = String(raw ?? "");
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\\n");
  return `"${normalized.replace(/"/g, '\\"')}"`;
}

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

function normalizeAiProvider(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "auto" || mode === "openai" || mode === "gemini") {
    return mode;
  }
  return undefined;
}

function buildEnvPatch(settings) {
  const envValues = new Map();

  const map = [
    ["openaiApiKey", "OPENAI_API_KEY"],
    ["geminiApiKey", "GEMINI_API_KEY"],
    ["openaiTextModel", "OPENAI_TEXT_MODEL"],
    ["openaiImageModel", "OPENAI_IMAGE_MODEL"],
    ["openaiTtsModel", "OPENAI_TTS_MODEL"],
    ["geminiTextModel", "GEMINI_TEXT_MODEL"],
    ["geminiImageModel", "GEMINI_IMAGE_MODEL"],
    ["geminiTtsModel", "GEMINI_TTS_MODEL"],
    ["gsheetSpreadsheetId", "GSHEETS_SPREADSHEET_ID"],
    ["gsheetSheetName", "GSHEETS_SHEET_NAME"],
    ["gsheetClientEmail", "GSHEETS_CLIENT_EMAIL"],
    ["gsheetPrivateKey", "GSHEETS_PRIVATE_KEY"],
    ["youtubeClientId", "YOUTUBE_CLIENT_ID"],
    ["youtubeClientSecret", "YOUTUBE_CLIENT_SECRET"],
    ["youtubeRedirectUri", "YOUTUBE_REDIRECT_URI"],
    ["youtubeRefreshToken", "YOUTUBE_REFRESH_TOKEN"]
  ];

  for (const [settingsKey, envKey] of map) {
    const value = settings?.[settingsKey];
    if (typeof value === "string" && value.trim() !== "") {
      envValues.set(envKey, value);
    }
  }

  const aiProvider = normalizeAiProvider(settings?.aiMode);
  if (aiProvider) {
    envValues.set("AI_PROVIDER", aiProvider);
  }

  return envValues;
}

function updateEnvFile(targetPath, envPatch, sourceLabel) {
  const existing = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : "";
  const lines = existing === "" ? [] : existing.split(/\r?\n/);
  const touched = new Set();

  const updated = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) {
      return line;
    }
    const key = match[1];
    if (!envPatch.has(key)) {
      return line;
    }
    touched.add(key);
    return `${key}=${toEnvValue(envPatch.get(key))}`;
  });

  const appendKeys = Array.from(envPatch.keys()).filter((key) => !touched.has(key));
  if (appendKeys.length > 0) {
    if (updated.length > 0 && updated[updated.length - 1] !== "") {
      updated.push("");
    }
    updated.push(`# Added by sync-env-from-settings (${sourceLabel})`);
    for (const key of appendKeys) {
      updated.push(`${key}=${toEnvValue(envPatch.get(key))}`);
    }
  }

  fs.writeFileSync(targetPath, `${updated.join("\n").trimEnd()}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/sync-env-from-settings.js [--source data/settings.dev-3000.json] [--target .env]");
    process.exit(0);
  }

  const webRoot = process.cwd();
  const sourcePath = path.resolve(webRoot, args.source || resolveDefaultSource(webRoot));
  const targetPath = path.resolve(webRoot, args.target || ".env");

  if (!fs.existsSync(sourcePath)) {
    console.error(`[sync-env] source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const settings = loadJson(sourcePath);
  const envPatch = buildEnvPatch(settings);

  if (envPatch.size === 0) {
    console.error("[sync-env] no non-empty settings keys found to sync.");
    process.exit(1);
  }

  updateEnvFile(targetPath, envPatch, path.basename(sourcePath));

  const keys = Array.from(envPatch.keys()).sort();
  console.log(`[sync-env] updated ${keys.length} keys -> ${path.relative(webRoot, targetPath)}`);
  console.log(`[sync-env] source: ${path.relative(webRoot, sourcePath)}`);
  console.log(`[sync-env] keys: ${keys.join(", ")}`);
}

main();

