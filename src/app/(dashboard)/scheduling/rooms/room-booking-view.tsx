"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { format, parseISO, addDays, subDays, startOfWeek, isSameDay } from "date-fns";

type Room = { id: string; name: string; capacity: number | null; location: string | null };
type Booking = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  room: { id: string; name: string } | null;
  booked_by_profile: { id: string; first_name: string; last_name: string } | null;
};

type Props = {
  rooms: Room[];
  initialBookings: Booking[];
  currentUserId: string;
  isOps: boolean;
  todayStr: string;
};

const SLOT_MINUTES = 30;
const DAY_START = 7; // 7am
const DAY_END = 19; // 7pm
const TOTAL_SLOTS = ((DAY_END - DAY_START) * 60) / SLOT_MINUTES;

const ROOM_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", fill: "bg-blue-500", light: "bg-blue-100" },
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", fill: "bg-violet-500", light: "bg-violet-100" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", fill: "bg-emerald-500", light: "bg-emerald-100" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", fill: "bg-amber-500", light: "bg-amber-100" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", fill: "bg-rose-500", light: "bg-rose-100" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", fill: "bg-cyan-500", light: "bg-cyan-100" },
];

function slotToTime(slot: number): string {
  const totalMin = DAY_START * 60 + slot * SLOT_MINUTES;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function slotToLabel(slot: number): string {
  const totalMin = DAY_START * 60 + slot * SLOT_MINUTES;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function timeToSlot(time: string): number {
  const d = parseISO(time);
  const totalMin = d.getHours() * 60 + d.getMinutes();
  return Math.max(0, Math.floor((totalMin - DAY_START * 60) / SLOT_MINUTES));
}

export function RoomBookingView({ rooms, initialBookings, currentUserId, isOps, todayStr }: Props) {
  const today = parseISO(todayStr);
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(rooms[0] ?? null);

  // Booking form state
  const [bookingStep, setBookingStep] = useState<"idle" | "picking" | "form">("idle");
  const [pickedStart, setPickedStart] = useState<number | null>(null);
  const [pickedEnd, setPickedEnd] = useState<number | null>(null);
  const [formData, setFormData] = useState({ title: "", notes: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add room (OPS)
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", location: "" });

  // Booking detail popover
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchBookings = useCallback(async (d: string) => {
    setLoading(true);
    const res = await fetch(`/api/bookings?date=${d}`);
    setBookings(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  const handleDateChange = (d: Date) => {
    setSelectedDate(d);
    setBookingStep("idle");
    setActiveBooking(null);
    fetchBookings(format(d, "yyyy-MM-dd"));
  };

  // Filter bookings for selected room
  const roomBookings = useMemo(() => {
    if (!selectedRoom) return [];
    return bookings.filter((b) => b.room?.id === selectedRoom.id);
  }, [bookings, selectedRoom]);

  // All room bookings for the day
  const allRoomBookings = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const rid = b.room?.id;
      if (!rid) continue;
      if (!map.has(rid)) map.set(rid, []);
      map.get(rid)!.push(b);
    }
    return map;
  }, [bookings]);

  // Check if a slot is booked
  const isSlotBooked = useCallback(
    (slot: number) => {
      for (const b of roomBookings) {
        const bStart = timeToSlot(b.start_time);
        const bEnd = timeToSlot(b.end_time);
        if (slot >= bStart && slot < bEnd) return b;
      }
      return null;
    },
    [roomBookings]
  );

  // Handle slot click
  const handleSlotClick = (slot: number) => {
    const booking = isSlotBooked(slot);
    if (booking) {
      setActiveBooking(booking);
      setBookingStep("idle");
      return;
    }

    setActiveBooking(null);

    if (bookingStep === "idle" || bookingStep === "form") {
      setPickedStart(slot);
      setPickedEnd(slot + 1);
      setBookingStep("picking");
    } else if (bookingStep === "picking" && pickedStart !== null) {
      if (slot >= pickedStart) {
        // Check no bookings in between
        let blocked = false;
        for (let s = pickedStart; s <= slot; s++) {
          if (isSlotBooked(s)) { blocked = true; break; }
        }
        if (!blocked) {
          setPickedEnd(slot + 1);
          setBookingStep("form");
        }
      } else {
        setPickedStart(slot);
        setPickedEnd(slot + 1);
      }
    }
  };

  // Submit booking
  const handleBook = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (pickedStart === null || pickedEnd === null || !selectedRoom) return;
    setError(null);
    setCreating(true);

    const startTotalMin = DAY_START * 60 + pickedStart * SLOT_MINUTES;
    const endTotalMin = DAY_START * 60 + pickedEnd * SLOT_MINUTES;
    const sh = Math.floor(startTotalMin / 60);
    const sm = startTotalMin % 60;
    const eh = Math.floor(endTotalMin / 60);
    const em = endTotalMin % 60;

    const start_time = `${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00Z`;
    const end_time = `${dateStr}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00Z`;

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: selectedRoom.id,
        title: formData.title,
        start_time,
        end_time,
        notes: formData.notes || null,
      }),
    });

    if (res.ok) {
      setBookingStep("idle");
      setFormData({ title: "", notes: "" });
      setPickedStart(null);
      setPickedEnd(null);
      fetchBookings(dateStr);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to book");
    }
    setCreating(false);
  }, [pickedStart, pickedEnd, selectedRoom, dateStr, formData, fetchBookings]);

  const handleCancel = useCallback(async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/bookings?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setActiveBooking(null);
      fetchBookings(dateStr);
    }
  }, [dateStr, fetchBookings]);

  const handleAddRoom = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomForm.name,
        capacity: roomForm.capacity ? parseInt(roomForm.capacity) : null,
        location: roomForm.location || null,
      }),
    });
    if (res.ok) window.location.reload();
  }, [roomForm]);

  // Generate week dates for date picker
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const roomColor = (roomId: string) => {
    const idx = rooms.findIndex((r) => r.id === roomId);
    return ROOM_COLORS[idx % ROOM_COLORS.length];
  };

  // Generate time labels
  const timeLabels = Array.from({ length: TOTAL_SLOTS }, (_, i) => ({
    slot: i,
    label: slotToLabel(i),
    isHour: (DAY_START * 60 + i * SLOT_MINUTES) % 60 === 0,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Room Booking</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          {isOps && (
            <button
              onClick={() => setShowAddRoom(true)}
              className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              + Add Room
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left sidebar — date picker + rooms */}
        <div className="w-72 shrink-0 space-y-5">
          {/* Date navigation */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => handleDateChange(subDays(selectedDate, 7))}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
              <span className="text-sm font-medium text-gray-800">
                {format(weekStart, "MMM yyyy")}
              </span>
              <button
                onClick={() => handleDateChange(addDays(selectedDate, 7))}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
              ))}
              {weekDates.map((d) => {
                const isSelected = isSameDay(d, selectedDate);
                const isToday = isSameDay(d, today);
                const isPast = d < today && !isToday;
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => handleDateChange(d)}
                    disabled={isPast}
                    className={`
                      w-9 h-9 rounded-xl text-sm font-medium transition-all flex items-center justify-center
                      ${isSelected
                        ? "bg-gray-900 text-white shadow-sm"
                        : isToday
                          ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                          : isPast
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-700 hover:bg-gray-100"
                      }
                    `}
                  >
                    {format(d, "d")}
                  </button>
                );
              })}
            </div>
            {!isSameDay(selectedDate, today) && (
              <button
                onClick={() => handleDateChange(today)}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Go to today
              </button>
            )}
          </div>

          {/* Room selector */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Rooms</h3>
            <div className="space-y-2">
              {rooms.map((room) => {
                const color = roomColor(room.id);
                const isActive = selectedRoom?.id === room.id;
                const roomBkgs = allRoomBookings.get(room.id) ?? [];
                const busySlots = roomBkgs.reduce((acc, b) => acc + (timeToSlot(b.end_time) - timeToSlot(b.start_time)), 0);
                const busyPercent = Math.round((busySlots / TOTAL_SLOTS) * 100);

                return (
                  <button
                    key={room.id}
                    onClick={() => { setSelectedRoom(room); setBookingStep("idle"); setActiveBooking(null); }}
                    className={`
                      w-full text-left p-3 rounded-xl border-2 transition-all
                      ${isActive
                        ? `${color.bg} ${color.border}`
                        : "border-transparent hover:bg-gray-50"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${color.fill}`} />
                      <span className={`text-sm font-medium ${isActive ? color.text : "text-gray-800"}`}>
                        {room.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 ml-4.5">
                      <span className="text-xs text-gray-400">
                        {room.capacity ? `${room.capacity} seats` : "—"}
                        {room.location ? ` · ${room.location}` : ""}
                      </span>
                    </div>
                    {/* Availability bar */}
                    <div className="mt-2 ml-4.5">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${busyPercent > 80 ? "bg-red-400" : busyPercent > 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${100 - busyPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {busyPercent === 0 ? "All day free" : `${100 - busyPercent}% available`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right content — timeline */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="bg-white rounded-2xl border border-gray-200 flex-1 overflow-hidden flex flex-col">
            {/* Room header */}
            {selectedRoom && (
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${roomColor(selectedRoom.id).fill}`} />
                  <h2 className="font-semibold text-gray-900">{selectedRoom.name}</h2>
                  {selectedRoom.capacity && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {selectedRoom.capacity} seats
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Click an open slot to book
                </p>
              </div>
            )}

            {/* Timeline grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-0">
                  {timeLabels.map(({ slot, label, isHour }) => {
                    const booking = isSlotBooked(slot);
                    const isBooked = !!booking;
                    const isPicked = pickedStart !== null && pickedEnd !== null && slot >= pickedStart && slot < pickedEnd;
                    const isPickStart = slot === pickedStart;
                    const color = selectedRoom ? roomColor(selectedRoom.id) : ROOM_COLORS[0];

                    // Booking display: show title only on first slot of booking
                    let isBookingStart = false;
                    if (booking) {
                      const bStart = timeToSlot(booking.start_time);
                      isBookingStart = slot === bStart;
                    }

                    return (
                      <div
                        key={slot}
                        onClick={() => handleSlotClick(slot)}
                        className={`
                          flex items-stretch cursor-pointer transition-all group
                          ${isHour ? "border-t border-gray-200" : "border-t border-gray-50"}
                        `}
                      >
                        {/* Time label */}
                        <div className="w-20 shrink-0 pr-3 py-2">
                          {isHour && (
                            <span className="text-xs text-gray-400 font-medium">{label}</span>
                          )}
                        </div>

                        {/* Slot area */}
                        <div
                          className={`
                            flex-1 py-2 px-3 min-h-[36px] rounded-lg transition-all relative
                            ${isBooked
                              ? `${color.light} ${activeBooking?.id === booking?.id ? "ring-2 ring-blue-400" : ""}`
                              : isPicked
                                ? `${color.bg} border ${color.border}`
                                : "hover:bg-gray-50"
                            }
                          `}
                        >
                          {isBooked && isBookingStart && booking && (
                            <div className="flex items-center gap-2">
                              <div className={`w-1 h-full absolute left-0 top-0 rounded-l-lg ${color.fill}`} />
                              <div className="pl-2">
                                <p className={`text-sm font-medium ${color.text}`}>{booking.title}</p>
                                <p className="text-xs text-gray-400">
                                  {format(parseISO(booking.start_time), "h:mm a")} – {format(parseISO(booking.end_time), "h:mm a")}
                                  {booking.booked_by_profile && ` · ${booking.booked_by_profile.first_name}`}
                                </p>
                              </div>
                            </div>
                          )}
                          {!isBooked && isPicked && isPickStart && (
                            <p className="text-xs text-gray-500">
                              {slotToLabel(pickedStart!)} – {slotToLabel(pickedEnd!)}
                            </p>
                          )}
                          {!isBooked && !isPicked && (
                            <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                              {label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Booking detail popover */}
          {activeBooking && (
            <div className="mt-3 bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{activeBooking.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {format(parseISO(activeBooking.start_time), "h:mm a")} – {format(parseISO(activeBooking.end_time), "h:mm a")}
                    {activeBooking.room && ` · ${activeBooking.room.name}`}
                  </p>
                  {activeBooking.booked_by_profile && (
                    <p className="text-xs text-gray-400 mt-1">
                      Booked by {activeBooking.booked_by_profile.first_name} {activeBooking.booked_by_profile.last_name}
                    </p>
                  )}
                  {activeBooking.notes && (
                    <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg p-2">{activeBooking.notes}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveBooking(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Close
                  </button>
                  {(isOps || activeBooking.booked_by_profile?.id === currentUserId) && (
                    <button
                      onClick={() => handleCancel(activeBooking.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Cancel booking
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Inline booking form */}
          {bookingStep === "form" && pickedStart !== null && pickedEnd !== null && (
            <div className="mt-3 bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${selectedRoom ? roomColor(selectedRoom.id).fill : "bg-gray-400"}`} />
                <div>
                  <h3 className="font-semibold text-gray-900">New Booking</h3>
                  <p className="text-sm text-gray-500">
                    {selectedRoom?.name} · {format(selectedDate, "EEE, MMM d")} · {slotToLabel(pickedStart)} – {slotToLabel(pickedEnd)}
                  </p>
                </div>
              </div>
              <form onSubmit={handleBook} className="space-y-3">
                <input
                  required
                  type="text"
                  placeholder="Meeting title"
                  value={formData.title}
                  onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <textarea
                  rows={2}
                  placeholder="Notes (optional)"
                  value={formData.notes}
                  onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setBookingStep("idle"); setPickedStart(null); setPickedEnd(null); setError(null); }}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !formData.title.trim()}
                    className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {creating ? "Booking..." : "Confirm Booking"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Picking hint */}
          {bookingStep === "picking" && (
            <div className="mt-3 bg-blue-50 rounded-2xl border border-blue-200 p-4 text-center">
              <p className="text-sm text-blue-700">
                Click another slot to set end time, or click the same slot to book {SLOT_MINUTES} minutes
              </p>
              <button
                onClick={() => setBookingStep("form")}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Use selected time ({slotToLabel(pickedStart!)} – {slotToLabel(pickedEnd!)})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add room modal (OPS) */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Room</h2>
            <form onSubmit={handleAddRoom} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={roomForm.capacity}
                    onChange={(e) => setRoomForm((f) => ({ ...f, capacity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <input
                    type="text"
                    value={roomForm.location}
                    onChange={(e) => setRoomForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddRoom(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
                >
                  Add Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
