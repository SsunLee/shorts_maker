import { promises as fs } from "fs";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"]);

function normalizeDisplayName(value: string): string {
  return String(value || "")
    .replace(/\s*\((truetype|opentype|type 1)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeFontPath(filePath: string): boolean {
  const normalized = String(filePath || "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("..")) return false;
  return (
    normalized.startsWith("c:\\windows\\fonts\\") ||
    normalized.startsWith("c:\\users\\")
  );
}

function resolveWindowsFontPath(rawValue: string): string {
  const value = String(rawValue || "").trim().replace(/^"+|"+$/g, "");
  if (!value) return "";
  if (/^[a-zA-Z]:\\/.test(value)) {
    return value;
  }
  return path.join("C:\\Windows\\Fonts", value);
}

function contentTypeByExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".otf") return "font/otf";
  if (ext === ".ttc") return "font/collection";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

async function queryRegistryFontRows(regPath: string): Promise<Array<{ name: string; value: string }>> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$item = Get-ItemProperty -Path 'Registry::${regPath}'
if (-not $item) { '[]'; exit 0 }
$skip = @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')
$rows = @()
foreach ($p in $item.PSObject.Properties) {
  if ($skip -contains $p.Name) { continue }
  $display = [string]$p.Name
  if ([string]::IsNullOrWhiteSpace($display)) { continue }
  $rows += [pscustomobject]@{
    name = $display
    value = [string]$p.Value
  }
}
$json = $rows | ConvertTo-Json -Compress
[Console]::Write($json)
`.trim();

  try {
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    const parsed = JSON.parse(String(stdout || "[]")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const item = row as { name?: string; value?: string };
        return {
          name: String(item.name || "").trim(),
          value: String(item.value || "").trim()
        };
      })
      .filter((row) => row.name && row.value);
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<Response> {
  if (process.platform !== "win32") {
    return NextResponse.json({ error: "Only supported on Windows host." }, { status: 400 });
  }

  const url = new URL(request.url);
  const name = normalizeDisplayName(url.searchParams.get("name") || "");
  if (!name) {
    return NextResponse.json({ error: "Missing name query." }, { status: 400 });
  }

  const [machineRows, userRows] = await Promise.all([
    queryRegistryFontRows("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"),
    queryRegistryFontRows("HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")
  ]);
  const allRows = [...userRows, ...machineRows];

  const matched = allRows.find((row) => normalizeDisplayName(row.name).toLowerCase() === name.toLowerCase());
  if (!matched) {
    return NextResponse.json({ error: "Font not found in registry." }, { status: 404 });
  }

  const filePath = resolveWindowsFontPath(matched.value);
  if (!filePath || !isSafeFontPath(filePath)) {
    return NextResponse.json({ error: "Invalid font path." }, { status: 400 });
  }

  const extension = path.extname(filePath).toLowerCase();
  if (!FONT_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: "Unsupported font extension." }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeByExtension(filePath),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Unable to read font file." }, { status: 404 });
  }
}

