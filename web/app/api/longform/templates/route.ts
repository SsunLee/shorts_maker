import { NextResponse } from "next/server";

export const runtime = "nodejs";

function featureRemoved(): NextResponse {
  return NextResponse.json(
    { error: "롱폼 -> 숏폼 변환 기능은 제거되었습니다." },
    { status: 410 }
  );
}

export async function GET(): Promise<NextResponse> {
  return featureRemoved();
}

export async function POST(): Promise<NextResponse> {
  return featureRemoved();
}

export async function PUT(): Promise<NextResponse> {
  return featureRemoved();
}

export async function DELETE(): Promise<NextResponse> {
  return featureRemoved();
}
