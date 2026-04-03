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
