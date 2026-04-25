import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  readInstagramDmState,
  writeInstagramDmState,
  type InstagramDmMetaCheck
} from "@/lib/instagram-dm-store";
import { getInstagramMetaAccountInfo } from "@/lib/instagram-meta-dm-service";

export const runtime = "nodejs";

function toMetaCheck(input: {
  ready: boolean;
  missing?: string[];
  message?: string;
  account?: {
    id?: string;
    username?: string;
  };
}): InstagramDmMetaCheck {
  return {
    checkedAt: new Date().toISOString(),
    ready: input.ready,
    missing: input.missing,
    message: input.message,
    account: input.account
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checkNow = request.nextUrl.searchParams.get("check") === "1";
  const state = await readInstagramDmState(userId);
  let nextState = state;
  let meta = state.lastMetaCheck;

  if (checkNow || !meta) {
    const info = await getInstagramMetaAccountInfo(userId);
    meta = toMetaCheck(info);
    nextState = {
      ...state,
      updatedAt: new Date().toISOString(),
      lastMetaCheck: meta
    };
    await writeInstagramDmState(nextState, userId);
  }

  return NextResponse.json({
    ok: true,
    meta: meta || null,
    runs: (nextState.runs || []).slice(0, 20)
  });
}

