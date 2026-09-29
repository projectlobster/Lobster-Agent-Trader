import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "error";
}

export function statusFor(error: unknown): number {
  switch (errorCode(error)) {
    case "kit_not_installed":
      return 503;
    case "llm_not_configured":
      return 400;
    case "kit_command_failed":
      return 502;
    default:
      return 500;
  }
}

export function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const detail = (error as { detail?: unknown })?.detail;
  return NextResponse.json(
    {
      error: message,
      code: errorCode(error),
      ...(typeof detail === "string" ? { detail } : {}),
    },
    { status: statusFor(error) },
  );
}

export function badRequest(message: string, code = "bad_request") {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

/**
 * Kit failures that are really state problems on our side get a status that says
 * so, instead of a blanket 502 from the upstream command layer.
 */
export function failKit(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/no paper account/i.test(message)) {
    return NextResponse.json(
      {
        error:
          "the paper account has not been initialised yet — create it from the Agent page, or run `npm run setup`",
        code: "paper_not_initialized",
      },
      { status: 409 },
    );
  }
  return fail(error);
}
