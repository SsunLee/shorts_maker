import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const allowedBrowserOrigins = [
  /^https:\/\/shorts-maker-icux(?:-[a-z0-9-]+)?\.vercel\.app$/i,
  /^https:\/\/shorts-maker-icux\.vercel\.app$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i
];

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const allowOrigin = allowedBrowserOrigins.some((pattern) => pattern.test(origin)) ? origin : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin"
  };
}

function json(request: NextRequest, body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init?.headers || {})
    }
  });
}

const postSchema = z.object({
  body: z.string().min(1),
  category: z.string().optional(),
  tags: z.string().optional(),
  title: z.string().min(1)
});

const schema = z
  .object({
    body: z.string().optional(),
    category: z.string().optional(),
    mode: z.enum(["prepare", "save-draft", "publish"]).default("prepare"),
    posts: z.array(postSchema).min(1).max(20).optional(),
    tags: z.string().optional(),
    title: z.string().optional(),
    writeUrl: z.string().url()
  })
  .superRefine((value, context) => {
    if (value.posts?.length) {
      return;
    }
    if (!value.title || !value.body) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "title/body 또는 posts 배열이 필요합니다."
      });
    }
  });

function runtimeDir(): string {
  return path.join(process.cwd(), ".local", "blog-tistory-automation");
}

function statusPath(): string {
  return path.join(runtimeDir(), "status.json");
}

function tistoryChromeProfileDir(): string {
  return path.join(process.cwd(), ".local", "tistory-chrome-profile");
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function canRunLocalBrowserAutomation(): boolean {
  if (process.env.BLOG_TISTORY_AUTOMATION_FORCE_LOCAL === "1") {
    return true;
  }

  if (process.platform === "win32") {
    return Boolean(process.env.USERPROFILE || process.env.LOCALAPPDATA);
  }

  if (process.platform === "darwin") {
    return Boolean(process.env.HOME);
  }

  if (process.platform === "linux") {
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }

  return false;
}

async function isTistoryChromeProfileInUse(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    const profile = quotePowerShellString(tistoryChromeProfileDir());
    const command = [
      `$profile = ${profile}`,
      '$count = @(Get-CimInstance Win32_Process -Filter "Name = \'chrome.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$profile*" }).Count',
      "Write-Output $count"
    ].join("; ");

    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });

    const finish = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, 3000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const count = Number.parseInt(stdout.trim(), 10);
      finish(Number.isFinite(count) && count > 0);
    });
  });
}

async function readStatus(): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(statusPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!canRunLocalBrowserAutomation()) {
      return json(
        request,
        { error: "티스토리 UI 자동화는 Chrome을 열 수 있는 PC 데스크톱 환경에서 실행할 수 있습니다." },
        { status: 400 }
      );
    }

    const payload = schema.parse(await request.json());
    const posts = payload.posts?.length
      ? payload.posts
      : [
          {
            body: payload.body || "",
            category: payload.category,
            tags: payload.tags,
            title: payload.title || ""
          }
        ];
    if (payload.mode === "prepare" && posts.length > 1) {
      return json(
        request,
        { error: "입력 후 검수 모드는 다건 연속 자동화에 사용할 수 없습니다. 임시저장 또는 공개 발행까지 모드를 선택해 주세요." },
        { status: 400 }
      );
    }
    await mkdir(runtimeDir(), { recursive: true });

    const current = await readStatus();
    if (current?.state === "running") {
      return json(
        request,
        { error: "이미 실행 중인 티스토리 자동화가 있습니다. 완료 후 다시 시도해 주세요." },
        { status: 409 }
      );
    }
    if (await isTistoryChromeProfileInUse()) {
      return json(
        request,
        {
          error:
            "티스토리 자동화 Chrome 프로필이 이미 열려 있습니다. 자동화로 열린 Chrome 창을 닫고 다시 실행해 주세요. 일반 Chrome 창은 그대로 둬도 됩니다."
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const payloadPath = path.join(runtimeDir(), `payload-${Date.now()}.json`);
    await writeFile(payloadPath, JSON.stringify({ ...payload, posts }, null, 2), "utf8");
    await writeFile(
      statusPath(),
      JSON.stringify(
        {
          logs: [{ at: now, message: "티스토리 자동화 요청을 생성했습니다." }],
          message: "티스토리 자동화 요청을 생성했습니다.",
          startedAt: now,
          state: "running",
          step: "queued",
          updatedAt: now
        },
        null,
        2
      ),
      "utf8"
    );

    const workerPath = path.join(process.cwd(), "scripts", "tistory-upload-worker.mjs");
    const child = spawn(process.execPath, ["--enable-source-maps", workerPath, "--payload", payloadPath, "--status", statusPath()], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();

    return json(request, { ok: true, status: await readStatus() });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof Error ? error.message : "티스토리 자동화 시작에 실패했습니다.";
    return json(request, { error: message }, { status });
  }
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}
