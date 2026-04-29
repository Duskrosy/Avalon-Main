import { z } from "zod";
import { NextResponse } from "next/server";

type ValidationSuccess<T> = { data: T; error: null };
type ValidationFailure = { data: null; error: NextResponse };

export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): ValidationSuccess<z.infer<T>> | ValidationFailure {
  const result = schema.safeParse(data);
  if (!result.success) {
    // Log full Zod issue list so emoji/unicode rejections are debuggable from server logs.
    console.warn("[validateBody] schema rejection", {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
    return {
      data: null,
      error: NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { data: result.data, error: null };
}
