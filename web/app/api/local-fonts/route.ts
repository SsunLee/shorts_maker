import { promises as fs } from "fs";
import type { Dirent } from "fs";
import path from "path";
import os from "os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"]);
const execFileAsync = promisify(execFile);

function isFontFile(name: string): boolean {
  return FONT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function normalizeFontNameFromFile(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  return withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWindowsFontDisplayName(value: string): string {
  return String(value || "")
    .replace(/\s*\((truetype|opentype|type 1)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function queryWindowsFontNamesFromRegistry(regPath: string): Promise<string[]> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$item = Get-ItemProperty -Path 'Registry::${regPath}'
if (-not $item) { '[]'; exit 0 }
$skip = @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')
$names = @()
foreach ($p in $item.PSObject.Properties) {
  if ($skip -contains $p.Name) { continue }
  $display = [string]$p.Name
  if ([string]::IsNullOrWhiteSpace($display)) { continue }
  # If mojibake/replacement-char appears in registry display name,
  # prefer file stem as a stable fallback instead of returning broken text.
  if ($display.Contains([char]0xFFFD)) {
    $fileName = [string]$p.Value
    if (-not [string]::IsNullOrWhiteSpace($fileName)) {
      $display = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
    }
  }
  $names += $display
}
$json = $names | ConvertTo-Json -Compress
[Console]::Write($json)
`.trim();
  try {
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    const parsed = JSON.parse(String(stdout || "[]")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeWindowsFontDisplayName(String(item || "")))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function listWindowsFontDisplayNames(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const [machineFonts, userFonts] = await Promise.all([
    queryWindowsFontNamesFromRegistry("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"),
    queryWindowsFontNamesFromRegistry("HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")
  ]);
  return Array.from(new Set([...machineFonts, ...userFonts]));
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

async function listFontFilesRecursive(root: string, maxDepth = 5): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
          return;
        }
        if (entry.isFile() && isFontFile(entry.name)) {
          results.push(entry.name);
        }
      })
    );
  }
  await walk(root, 0);
  return results;
}

function resolveFontDirectories(): string[] {
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "win32") {
    return ["C:\\Windows\\Fonts"];
  }
  if (platform === "darwin") {
    return [
      "/System/Library/Fonts",
      "/Library/Fonts",
      path.join(home, "Library", "Fonts")
    ];
  }
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    path.join(home, ".fonts"),
    path.join(home, ".local", "share", "fonts")
  ];
}

export async function GET(): Promise<NextResponse> {
  const fontDirs = resolveFontDirectories();
  const [fileNames, windowsDisplayNames] = await Promise.all([
    (await Promise.all(fontDirs.map((dir) => listFontFilesRecursive(dir)))).flat(),
    listWindowsFontDisplayNames()
  ]);
  const fileStemNames = fileNames.map((fileName) => normalizeFontNameFromFile(fileName));
  const merged = [...windowsDisplayNames, ...fileStemNames];
  const names = dedupeCaseInsensitive(merged).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return NextResponse.json({ fonts: names });
}
