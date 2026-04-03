import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { metaGet, resolveMetaConfig, validateMetaConfig } from "@/lib/instagram-meta-service";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await resolveMetaConfig(userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      ready: false,
      missing,
      message: "Meta 설정이 누락되었습니다."
    });
  }

  try {
    const account = (await metaGet({
      config,
      path: `/${encodeURIComponent(config.instagramAccountId)}`,
      // account_type is not available on some IG account edges and can throw code 100.
      params: { fields: "id,username" }
    })) as {
      id?: string;
      username?: string;
    };

    return NextResponse.json({
      ok: true,
      ready: true,
      account: {
        id: account.id || config.instagramAccountId,
        username: account.username || "",
        accountType: ""
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ready: false,
      message: error instanceof Error ? error.message : "Meta API 검사에 실패했습니다."
    });
  }
}
