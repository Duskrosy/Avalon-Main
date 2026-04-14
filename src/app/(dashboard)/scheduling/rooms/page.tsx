import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { RoomBookingView } from "./room-booking-view";

export default async function RoomsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const todayStr = new Date().toISOString().split("T")[0];

  const [{ data: rooms }, { data: bookings }, { data: users }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, capacity, location, is_active, open_time, close_time, slot_duration")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("room_bookings")
      .select(`
        id, title, start_time, end_time, notes,
        room:rooms(id, name),
        booked_by_profile:profiles!booked_by(id, first_name, last_name, avatar_url),
        invitees:booking_invitees(
          id, user_id,
          profile:profiles!user_id(id, first_name, last_name, avatar_url)
        )
      `)
      .gte("start_time", `${todayStr}T00:00:00Z`)
      .lte("start_time", `${todayStr}T23:59:59Z`)
      .order("start_time"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
  ]);

  return (
    <RoomBookingView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rooms={(rooms ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialBookings={(bookings ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allUsers={(users ?? []) as any}
      currentUserId={currentUser.id}
      isOps={isOps(currentUser)}
      todayStr={todayStr}
    />
  );
}
