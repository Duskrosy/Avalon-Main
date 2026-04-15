"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { format, parseISO, addDays, subDays, startOfWeek, isSameDay } from "date-fns";

type Room = {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  open_time: string;   // "08:00:00"
  close_time: string;  // "18:00:00"
  slot_duration: number; // 15, 30, or 60
};

type User = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type Invitee = {
  id: string;
  user_id: string;
  profile: User | null;
};

type Booking = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  room: { id: string; name: string } | null;
  booked_by_profile: User | null;
  invitees?: Invitee[];
};

type Props = {
  rooms: Room[];
  initialBookings: Booking[];
  allUsers: User[];
  currentUserId: string;
  isOps: boolean;
  todayStr: string;
};

const ROOM_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", fill: "bg-blue-500", light: "bg-blue-100", accent: "bg-blue-600" },
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", fill: "bg-violet-500", light: "bg-violet-100", accent: "bg-violet-600" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", fill: "bg-emerald-500", light: "bg-emerald-100", accent: "bg-emerald-600" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", fill: "bg-amber-500", light: "bg-amber-100", accent: "bg-amber-600" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", fill: "bg-rose-500", light: "bg-rose-100", accent: "bg-rose-600" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", fill: "bg-cyan-500", light: "bg-cyan-100", accent: "bg-cyan-600" },
];

// ─── AVATAR ──────────────────────────────────────────────────────────────────
function Avatar({ user, size = "sm" }: { user: User; size?: "sm" | "md" }) {
  const name = `${user.first_name} ${user.last_name}`;
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const cls = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";

  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={name} className={`${cls} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${cls} rounded-full bg-gray-200 flex items-center justify-center font-medium text-gray-600 shrink-0`}>
      {initials}
    </div>
  );
}

// ─── USER PICKER (for invites) ──────────────────────────────────────────────
function UserPicker({
  allUsers,
  selected,
  onChange,
  excludeId,
}: {
  allUsers: User[];
  selected: string[];
  onChange: (ids: string[]) => void;
  excludeId: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = allUsers.filter((u) => {
    if (u.id === excludeId) return false;
    return `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        className="border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer min-h-[42px]"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-gray-400">Invite people (optional)</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((id) => {
              const user = allUsers.find((u) => u.id === id);
              if (!user) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 pl-1 pr-2 py-0.5 rounded-full">
                  <Avatar user={user} size="sm" />
                  {user.first_name}
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggle(id); }} className="text-gray-400 hover:text-gray-600 ml-0.5">&times;</button>
                </span>
              );
            })}
          </div>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">No one found</p>
            ) : (
              filtered.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => toggle(user.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selected.includes(user.id) ? "bg-blue-50" : ""
                  }`}
                >
                  <Avatar user={user} />
                  <span className="flex-1">{user.first_name} {user.last_name}</span>
                  {selected.includes(user.id) && <span className="text-blue-500 font-bold">&#10003;</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToLabel(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? "s" : ""}`;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function RoomBookingView({ rooms, initialBookings, allUsers, currentUserId, isOps, todayStr }: Props) {
  const today = parseISO(todayStr);
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(rooms[0] ?? null);

  // Selection state
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set());
  const [multiSelect, setMultiSelect] = useState(false);

  // Modal state
  const [showBookModal, setShowBookModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Booking | null>(null);
  const [showRoomSettings, setShowRoomSettings] = useState<Room | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ title: "", notes: "" });
  const [invitees, setInvitees] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Room form
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", location: "", open_time: "08:00", close_time: "18:00", slot_duration: 30 });

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchBookings = useCallback(async (d: string) => {
    setLoading(true);
    const res = await fetch(`/api/bookings?date=${d}`);
    setBookings(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  const handleDateChange = (d: Date) => {
    setSelectedDate(d);
    setSelectedSlots(new Set());
    setMultiSelect(false);
    fetchBookings(format(d, "yyyy-MM-dd"));
  };

  // Room's slots
  const roomSlots = useMemo(() => {
    if (!selectedRoom) return [];
    const openMin = parseTime(selectedRoom.open_time);
    const closeMin = parseTime(selectedRoom.close_time);
    const dur = selectedRoom.slot_duration;
    const slots: { index: number; startMin: number; endMin: number }[] = [];
    for (let m = openMin; m < closeMin; m += dur) {
      slots.push({ index: slots.length, startMin: m, endMin: m + dur });
    }
    return slots;
  }, [selectedRoom]);

  // Room bookings
  const roomBookings = useMemo(() => {
    if (!selectedRoom) return [];
    return bookings.filter((b) => b.room?.id === selectedRoom.id);
  }, [bookings, selectedRoom]);

  // All-room booking counts
  const allRoomBookings = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      const rid = b.room?.id;
      if (!rid) continue;
      map.set(rid, (map.get(rid) ?? 0) + 1);
    }
    return map;
  }, [bookings]);

  // Is slot booked?
  const getSlotBooking = useCallback((slotStartMin: number, slotEndMin: number): Booking | null => {
    for (const b of roomBookings) {
      const bStart = parseISO(b.start_time);
      const bEnd = parseISO(b.end_time);
      const bStartMin = bStart.getHours() * 60 + bStart.getMinutes();
      const bEndMin = bEnd.getHours() * 60 + bEnd.getMinutes();
      if (slotStartMin < bEndMin && slotEndMin > bStartMin) return b;
    }
    return null;
  }, [roomBookings]);

  // Handle slot click
  const handleSlotClick = (slotIndex: number) => {
    const slot = roomSlots[slotIndex];
    if (!slot) return;

    const booking = getSlotBooking(slot.startMin, slot.endMin);
    if (booking) {
      setShowDetailModal(booking);
      return;
    }

    if (multiSelect) {
      setSelectedSlots((prev) => {
        const next = new Set(prev);
        if (next.has(slotIndex)) next.delete(slotIndex);
        else next.add(slotIndex);
        return next;
      });
    } else {
      // Single click: select this slot and show action buttons
      setSelectedSlots(new Set([slotIndex]));
    }
  };

  // Expand selection by N slots from current
  const expandSelection = (totalSlots: number) => {
    if (selectedSlots.size === 0) return;
    const minSlot = Math.min(...selectedSlots);
    const newSet = new Set<number>();
    for (let i = 0; i < totalSlots; i++) {
      const idx = minSlot + i;
      if (idx >= roomSlots.length) break;
      const s = roomSlots[idx];
      if (getSlotBooking(s.startMin, s.endMin)) break;
      newSet.add(idx);
    }
    setSelectedSlots(newSet);
  };

  // Open booking modal
  const openBookModal = () => {
    setFormData({ title: "", notes: "" });
    setInvitees([]);
    setError(null);
    setShowBookModal(true);
  };

  // Computed selected range
  const selectedRange = useMemo(() => {
    if (selectedSlots.size === 0 || !selectedRoom) return null;
    const sorted = Array.from(selectedSlots).sort((a, b) => a - b);
    const first = roomSlots[sorted[0]];
    const last = roomSlots[sorted[sorted.length - 1]];
    if (!first || !last) return null;
    return {
      startMin: first.startMin,
      endMin: last.endMin,
      duration: last.endMin - first.startMin,
      startLabel: minutesToLabel(first.startMin),
      endLabel: minutesToLabel(last.endMin),
    };
  }, [selectedSlots, roomSlots, selectedRoom]);

  // Submit booking
  const handleBook = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRange || !selectedRoom) return;
    setError(null);
    setCreating(true);

    const sh = Math.floor(selectedRange.startMin / 60);
    const sm = selectedRange.startMin % 60;
    const eh = Math.floor(selectedRange.endMin / 60);
    const em = selectedRange.endMin % 60;

    const start_time = `${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00+08:00`;
    const end_time = `${dateStr}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00+08:00`;

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
      const created = await res.json();
      // Add invitees if any
      if (invitees.length > 0 && created.id) {
        await fetch(`/api/bookings/${created.id}/invitees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: invitees }),
        });
      }
      setShowBookModal(false);
      setSelectedSlots(new Set());
      setMultiSelect(false);
      fetchBookings(dateStr);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to book");
    }
    setCreating(false);
  }, [selectedRange, selectedRoom, dateStr, formData, invitees, fetchBookings]);

  const handleCancel = useCallback(async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/bookings?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setShowDetailModal(null);
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
        open_time: roomForm.open_time,
        close_time: roomForm.close_time,
        slot_duration: roomForm.slot_duration,
      }),
    });
    if (res.ok) window.location.reload();
  }, [roomForm]);

  const handleSaveRoomSettings = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRoomSettings) return;
    await fetch(`/api/rooms?id=${showRoomSettings.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        open_time: showRoomSettings.open_time,
        close_time: showRoomSettings.close_time,
        slot_duration: showRoomSettings.slot_duration,
        capacity: showRoomSettings.capacity,
        location: showRoomSettings.location,
      }),
    });
    window.location.reload();
  }, [showRoomSettings]);

  // Week dates
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const roomColor = (roomId: string) => {
    const idx = rooms.findIndex((r) => r.id === roomId);
    return ROOM_COLORS[idx % ROOM_COLORS.length];
  };

  // Duration options for the quick-action buttons
  const durationOptions = useMemo(() => {
    if (!selectedRoom || selectedSlots.size === 0) return [];
    const dur = selectedRoom.slot_duration;
    const opts: { slots: number; label: string }[] = [];
    // Always show 1 slot (the base duration)
    opts.push({ slots: 1, label: durationLabel(dur) });
    // Show 2 slots if possible
    if (dur <= 30) opts.push({ slots: 2, label: durationLabel(dur * 2) });
    // Show 4 slots for 15-min rooms
    if (dur === 15) opts.push({ slots: 4, label: durationLabel(60) });
    return opts;
  }, [selectedRoom, selectedSlots.size]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Room Booking</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-2">
          {isOps && (
            <button onClick={() => setShowAddRoom(true)} className="text-sm px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
              + Add Room
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-72 shrink-0 space-y-5">
          {/* Date navigation */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => handleDateChange(subDays(selectedDate, 7))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
              <span className="text-sm font-medium text-gray-800">{format(weekStart, "MMM yyyy")}</span>
              <button onClick={() => handleDateChange(addDays(selectedDate, 7))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
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
                    className={`w-9 h-9 rounded-xl text-sm font-medium transition-all flex items-center justify-center ${
                      isSelected ? "bg-gray-900 text-white shadow-sm" : isToday ? "bg-blue-50 text-blue-700" : isPast ? "text-gray-300" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {format(d, "d")}
                  </button>
                );
              })}
            </div>
            {!isSameDay(selectedDate, today) && (
              <button onClick={() => handleDateChange(today)} className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-medium">
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
                const bookingCount = allRoomBookings.get(room.id) ?? 0;
                const openH = parseTime(room.open_time) / 60;
                const closeH = parseTime(room.close_time) / 60;

                return (
                  <button
                    key={room.id}
                    onClick={() => { setSelectedRoom(room); setSelectedSlots(new Set()); setMultiSelect(false); }}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      isActive ? `${color.bg} ${color.border}` : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${color.fill}`} />
                        <span className={`text-sm font-medium ${isActive ? color.text : "text-gray-800"}`}>{room.name}</span>
                      </div>
                      {isOps && isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowRoomSettings({ ...room }); }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          &#9881;
                        </button>
                      )}
                    </div>
                    <div className="ml-4.5 mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <span>{room.capacity ? `${room.capacity} seats` : "No limit"}</span>
                      <span>&middot;</span>
                      <span>{Math.round(openH)}am–{closeH > 12 ? `${Math.round(closeH - 12)}pm` : `${Math.round(closeH)}am`}</span>
                      <span>&middot;</span>
                      <span>{room.slot_duration}min</span>
                    </div>
                    {bookingCount > 0 && (
                      <p className="ml-4.5 mt-1 text-xs text-gray-400">{bookingCount} booking{bookingCount !== 1 ? "s" : ""} today</p>
                    )}
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
                </div>
                <p className="text-xs text-gray-400">Click a slot to book</p>
              </div>
            )}

            {/* Timeline grid */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading ? (
                <div className="space-y-1 py-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-stretch">
                      <div className="w-20 shrink-0 pr-3 py-2">
                        {i % 2 === 0 && <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />}
                      </div>
                      <div className="flex-1 py-1">
                        <div className="h-8 animate-pulse rounded-lg bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedRoom ? (
                <div className="space-y-1">
                  {roomSlots.map((slot) => {
                    const booking = getSlotBooking(slot.startMin, slot.endMin);
                    const isBooked = !!booking;
                    const isSelected = selectedSlots.has(slot.index);
                    const color = roomColor(selectedRoom.id);
                    const isHour = slot.startMin % 60 === 0;

                    // Only show booking info on first slot of the booking
                    let isBookingStart = false;
                    if (booking) {
                      const bStart = parseISO(booking.start_time);
                      const bStartMin = bStart.getHours() * 60 + bStart.getMinutes();
                      isBookingStart = slot.startMin === bStartMin;
                    }

                    return (
                      <div key={slot.index} className="flex items-stretch group">
                        {/* Time */}
                        <div className="w-20 shrink-0 pr-3 py-2">
                          {isHour && <span className="text-xs text-gray-400 font-medium">{minutesToLabel(slot.startMin)}</span>}
                        </div>

                        {/* Slot */}
                        <div
                          onClick={() => handleSlotClick(slot.index)}
                          className={`
                            flex-1 py-2.5 px-4 rounded-xl cursor-pointer transition-all relative min-h-[44px] flex items-center
                            ${isBooked
                              ? `${color.light} hover:opacity-90`
                              : isSelected
                                ? `${color.bg} border-2 ${color.border} shadow-sm`
                                : "hover:bg-gray-50 border-2 border-transparent hover:border-gray-200"
                            }
                          `}
                        >
                          {isBooked && isBookingStart && booking && (
                            <div className="flex items-center gap-2 w-full">
                              <div className={`w-1 h-8 rounded-full ${color.fill} shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${color.text} truncate`}>{booking.title}</p>
                                <p className="text-xs text-gray-400 truncate">
                                  {format(parseISO(booking.start_time), "h:mm a")} – {format(parseISO(booking.end_time), "h:mm a")}
                                  {booking.booked_by_profile && ` · ${booking.booked_by_profile.first_name}`}
                                </p>
                              </div>
                              {booking.invitees && booking.invitees.length > 0 && (
                                <div className="flex -space-x-1.5">
                                  {booking.invitees.slice(0, 3).map((inv) => inv.profile && (
                                    <Avatar key={inv.id} user={inv.profile} size="sm" />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {isBooked && !isBookingStart && (
                            <div className={`w-1 h-4 rounded-full ${color.fill} opacity-30 ml-0`} />
                          )}
                          {!isBooked && isSelected && (
                            <span className={`text-xs font-medium ${color.text}`}>
                              {minutesToLabel(slot.startMin)} – {minutesToLabel(slot.endMin)}
                            </span>
                          )}
                          {!isBooked && !isSelected && (
                            <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                              {minutesToLabel(slot.startMin)} — Available
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">Select a room to see availability</p>
              )}
            </div>
          </div>

          {/* Sticky action bar — always visible at bottom */}
          <div className="sticky bottom-0 z-10 mt-3">
            <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-lg">
              {selectedSlots.size > 0 && selectedRange ? (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      {selectedRange.startLabel} – {selectedRange.endLabel}
                      <span className="text-gray-400 ml-1.5">({durationLabel(selectedRange.duration)})</span>
                    </p>
                    <button
                      onClick={() => { setSelectedSlots(new Set()); setMultiSelect(false); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Quick duration buttons */}
                    {!multiSelect && durationOptions.map((opt) => (
                      <button
                        key={opt.slots}
                        onClick={() => expandSelection(opt.slots)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          selectedSlots.size === opt.slots
                            ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {/* Multi-select toggle */}
                    <button
                      onClick={() => setMultiSelect(!multiSelect)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        multiSelect
                          ? "bg-amber-50 border-amber-200 text-amber-700 font-medium"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {multiSelect ? "Multi-select on" : "Custom"}
                    </button>
                    <button
                      onClick={openBookModal}
                      className="text-sm px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-sm"
                    >
                      Book
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">
                    {selectedRoom ? "Select a time slot above to get started" : "Pick a room from the sidebar"}
                  </p>
                  {selectedRoom && (
                    <button
                      onClick={() => setMultiSelect(!multiSelect)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        multiSelect
                          ? "bg-amber-50 border-amber-200 text-amber-700 font-medium"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {multiSelect ? "Multi-select on" : "Select multiple slots"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── BOOKING CONFIRMATION MODAL ──────────────────────────────────────── */}
      {showBookModal && selectedRange && selectedRoom && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowBookModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-10 h-10 rounded-xl ${roomColor(selectedRoom.id).light} flex items-center justify-center`}>
                  <div className={`w-4 h-4 rounded-full ${roomColor(selectedRoom.id).fill}`} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Confirm Booking</h2>
                  <p className="text-sm text-gray-500">
                    {selectedRoom.name} &middot; {format(selectedDate, "EEE, MMM d")} &middot; {selectedRange.startLabel} – {selectedRange.endLabel}
                  </p>
                </div>
              </div>

              <form onSubmit={handleBook} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Meeting title</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g., Sprint Planning"
                    value={formData.title}
                    onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite people</label>
                  <UserPicker
                    allUsers={allUsers}
                    selected={invitees}
                    onChange={setInvitees}
                    excludeId={currentUserId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Agenda, links, etc. (optional)"
                    value={formData.notes}
                    onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p><span className="font-medium text-gray-700">Duration:</span> {durationLabel(selectedRange.duration)}</p>
                    <p><span className="font-medium text-gray-700">Room:</span> {selectedRoom.name}{selectedRoom.capacity ? ` (${selectedRoom.capacity} seats)` : ""}</p>
                    {invitees.length > 0 && <p><span className="font-medium text-gray-700">Invitees:</span> {invitees.length} people</p>}
                  </div>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowBookModal(false)}
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
          </div>
        </div>
      )}

      {/* ─── BOOKING DETAIL MODAL ────────────────────────────────────────────── */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{showDetailModal.title}</h3>
            <p className="text-sm text-gray-500">
              {format(parseISO(showDetailModal.start_time), "h:mm a")} – {format(parseISO(showDetailModal.end_time), "h:mm a")}
              {showDetailModal.room && ` · ${showDetailModal.room.name}`}
            </p>

            {showDetailModal.booked_by_profile && (
              <div className="flex items-center gap-2 mt-4">
                <Avatar user={showDetailModal.booked_by_profile} size="md" />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {showDetailModal.booked_by_profile.first_name} {showDetailModal.booked_by_profile.last_name}
                  </p>
                  <p className="text-xs text-gray-400">Organizer</p>
                </div>
              </div>
            )}

            {showDetailModal.invitees && showDetailModal.invitees.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Invitees</p>
                <div className="space-y-2">
                  {showDetailModal.invitees.map((inv) => inv.profile && (
                    <div key={inv.id} className="flex items-center gap-2">
                      <Avatar user={inv.profile} size="sm" />
                      <span className="text-sm text-gray-700">{inv.profile.first_name} {inv.profile.last_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDetailModal.notes && (
              <div className="mt-4 bg-gray-50 rounded-xl p-3">
                <p className="text-sm text-gray-600">{showDetailModal.notes}</p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDetailModal(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50">
                Close
              </button>
              {(isOps || showDetailModal.booked_by_profile?.id === currentUserId) && (
                <button onClick={() => handleCancel(showDetailModal.id)} className="flex-1 border border-red-200 text-red-600 text-sm py-2.5 rounded-xl hover:bg-red-50">
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ROOM SETTINGS MODAL (OPS) ───────────────────────────────────────── */}
      {showRoomSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRoomSettings(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Room Settings</h2>
            <form onSubmit={handleSaveRoomSettings} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Opens at</label>
                  <input
                    type="time"
                    value={showRoomSettings.open_time.slice(0, 5)}
                    onChange={(e) => setShowRoomSettings((r) => r ? { ...r, open_time: e.target.value } : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Closes at</label>
                  <input
                    type="time"
                    value={showRoomSettings.close_time.slice(0, 5)}
                    onChange={(e) => setShowRoomSettings((r) => r ? { ...r, close_time: e.target.value } : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Session length</label>
                <div className="flex gap-2">
                  {[15, 30, 60].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setShowRoomSettings((r) => r ? { ...r, slot_duration: d } : null)}
                      className={`flex-1 py-2 text-sm rounded-xl border-2 transition-colors ${
                        showRoomSettings.slot_duration === d
                          ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={showRoomSettings.capacity ?? ""}
                    onChange={(e) => setShowRoomSettings((r) => r ? { ...r, capacity: e.target.value ? parseInt(e.target.value) : null } : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <input
                    type="text"
                    value={showRoomSettings.location ?? ""}
                    onChange={(e) => setShowRoomSettings((r) => r ? { ...r, location: e.target.value || null } : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRoomSettings(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-xl hover:bg-blue-700 font-medium">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ADD ROOM MODAL (OPS) ────────────────────────────────────────────── */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddRoom(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Room</h2>
            <form onSubmit={handleAddRoom} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input required type="text" value={roomForm.name} onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Opens at</label>
                  <input type="time" value={roomForm.open_time} onChange={(e) => setRoomForm((f) => ({ ...f, open_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Closes at</label>
                  <input type="time" value={roomForm.close_time} onChange={(e) => setRoomForm((f) => ({ ...f, close_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Session length</label>
                <div className="flex gap-2">
                  {[15, 30, 60].map((d) => (
                    <button key={d} type="button" onClick={() => setRoomForm((f) => ({ ...f, slot_duration: d }))}
                      className={`flex-1 py-2 text-sm rounded-xl border-2 transition-colors ${
                        roomForm.slot_duration === d ? "bg-blue-50 border-blue-200 text-blue-700 font-medium" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Capacity</label>
                  <input type="number" min="1" value={roomForm.capacity} onChange={(e) => setRoomForm((f) => ({ ...f, capacity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <input type="text" value={roomForm.location} onChange={(e) => setRoomForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddRoom(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-xl hover:bg-blue-700 font-medium">Add Room</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
