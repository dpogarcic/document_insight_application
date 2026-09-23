import { NextRequest, NextResponse } from "next/server";

const documentInsightApiUrl =
  process.env.DOCUMENT_INSIGHT_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

type QueryInput = {
  question?: unknown;
  filter?: unknown;
  top_k?: unknown;
};

export async function POST(request: NextRequest) {
  let input: QueryInput;
  try {
    input = (await request.json()) as QueryInput;
  } catch {
    return NextResponse.json({ detail: "A JSON request body is required." }, { status: 400 });
  }

  if (typeof input.question !== "string" || !input.question.trim()) {
    return NextResponse.json({ detail: "A question is required." }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization === null) {
    return NextResponse.json({ detail: "Authentication is required." }, { status: 401 });
  }

  try {
    const response = await fetch(`${documentInsightApiUrl}/query`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: input.question.trim(),
        ...(typeof input.filter === "string" && input.filter.trim()
          ? { filter: input.filter.trim() }
          : {}),
        ...(typeof input.top_k === "number" ? { top_k: input.top_k } : {}),
      }),
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "The Document Insight API is unavailable." },
      { status: 503 },
    );
  }
}
