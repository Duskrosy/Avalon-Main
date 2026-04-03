import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

// POST /api/memos/[id]/sign — current user signs the memo
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check memo exists and is accessible
  const { error: memoErr } = await supabase
    .from("memos")
    .select("id")
    .eq("id", id)
    .single();

  if (memoErr) return NextResponse.json({ error: "Memo not found" }, { status: 404 });

  // Upsert-style: insert, ignore duplicate
  const { error } = await supabase.from("memo_signatures").insert({
    memo_id: id,
    user_id: currentUser.id,
  });

  // 23505 = unique_violation — already signed
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/memos/[id]/sign — unsign (own signature only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("memo_signatures")
    .delete()
    .eq("memo_id", id)
    .eq("user_id", currentUser.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
