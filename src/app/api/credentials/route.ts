import { z } from "zod";
import { badRequest, fail, ok } from "@/lib/api";
import {
  CredentialsError,
  clearCredentials,
  credentialsAuthStatus,
  readCredentialsStatus,
  writeCredentials,
} from "@/lib/kit/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Save = z.object({
  privateKey: z.string().max(200).optional(),
  accountIndex: z.number().int().min(0).max(2^31 - 1).optional(),
  apiKeyIndex: z.number().int().min(0).max(2^31 - 1).optional(),
});

async function respond() {
  return ok({
    credentials: readCredentialsStatus(),
    auth: await credentialsAuthStatus(),
  });
}

export async function GET() {
  try {
    return await respond();
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const parsed = Save.safeParse(body);
  if (!parsed.success) {
    return badRequest("invalid credentials payload", "invalid_credentials");
  }

  const { privateKey, accountIndex, apiKeyIndex } = parsed.data;
  // A blank field means "leave the stored value alone", not "delete it" — the
  // browser never receives the current key, so it cannot echo it back.
  if (privateKey !== undefined && privateKey.trim().length === 0) {
    return badRequest(
      "leave the private key field empty to keep the stored key, or clear it explicitly",
      "empty_private_key",
    );
  }
  if (privateKey === undefined && accountIndex === undefined && apiKeyIndex === undefined) {
    return badRequest("nothing to save", "empty_patch");
  }

  try {
    writeCredentials({
      ...(privateKey !== undefined ? { privateKey } : {}),
      ...(accountIndex !== undefined ? { accountIndex } : {}),
      ...(apiKeyIndex !== undefined ? { apiKeyIndex } : {}),
    });
    return await respond();
  } catch (error) {
    if (error instanceof CredentialsError) {
      return badRequest(error.message, error.code);
    }
    return fail(error);
  }
}

export async function DELETE() {
  try {
    const result = clearCredentials();
    return ok({ ...result, credentials: readCredentialsStatus(), auth: await credentialsAuthStatus() });
  } catch (error) {
    return fail(error);
  }
}
