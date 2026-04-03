"use client";

import { useState, useCallback } from "react";
import { format, parseISO } from "date-fns";

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

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7am - 7pm

function TimelineGrid({
  bookings,
  currentUserId,
  isOps,
  onCancel,
}: {
  bookings: Booking[];
  currentUserId: string;
  isOps: boolean;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="relative">
      {/* Hour labels */}
      <div className="grid" style={{ gridTemplateColumns: "3rem 1fr" }}>
        <div />
        <div className="grid grid-cols-13 border-l border-gray-100">
          {HOURS.map((h) => (
            <div key={h} className="text-xs text-gray-400 pb-1 pl-1">
              {h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
            </div>
          ))}
        </div>
      </div>
      {/* Timeline rows per room */}
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No bookings today.</p>
      ) : (
        bookings.map((b) => {
          const start = parseISO(b.start_time);
          const end   = parseISO(b.end_time);
          const startH = start.getHours() + start.getMinutes() / 60;
          const endH   = end.getHours()   + end.getMinutes()   / 60;
          const left  = ((Math.max(startH, 7) - 7) / 12) * 100;
          const width = ((Math.min(endH, 19)  - Math.max(startH, 7)) / 12) * 100;
          const canCancel = isOps || b.booked_by_profile?.id === currentUserId;

          return (
            <div key={b.id} className="flex items-center gap-2 py-1">
              <div className="text-xs text-gray-500 w-12 shrink-0 truncate">
                {b.room?.name ?? "—"}
              </div>
              <div className="flex-1 relative h-8">
                <div className="absolute inset-0 bg-gray-50 rounded" />
                <div
                  className="absolute top-1 bottom-1 bg-blue-100 border border-blue-300 rounded text-xs text-blue-700 px-1.5 flex items-center gap-1 min-w-0 overflow-hidden"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span className="truncate font-medium">{b.title}</span>
                  {canCancel && (
                    <button
                      onClick={() => onCancel(b.id)}
                      className="shrink-0 text-blue-400 hover:text-red-400 ml-auto"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function RoomBookingView({ rooms, initialBookings, currentUserId, isOps, todayStr }: Props) {
  const [date, setDate] = useState(todayStr);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    room_id: rooms[0]?.id ?? "",
    title: "",
    date: todayStr,
    start_hour: "9",
    start_min: "00",
    end_hour: "10",
    end_min: "00",
    notes: "",
  });

  // New room form (OPS only)
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", location: "" });

  const fetchBookings = useCallback(async (d: string) => {
    setLoading(true);
    const res = await fetch(`/api/bookings?date=${d}`);
    setBookings(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  const handleDateChange = (d: string) => {
    setDate(d);
    fetchBookings(d);
  };

  const handleBook = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);

    const start_time = `${form.date}T${form.start_hour.padStart(2, "0")}:${form.start_min}:00`;
    const end_time   = `${form.date}T${form.end_hour.padStart(2, "0")}:${form.end_min}:00`;

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: form.room_id,
        title: form.title,
        start_time,
        end_time,
        notes: form.notes || null,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setForm((f) => ({ ...f, title: "", notes: "" }));
      fetchBookings(date);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to book");
    }
    setCreating(false);
  }, [form, date, fetchBookings]);

  const handleCancel = useCallback(async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/bookings?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchBookings(date);
  }, [date, fetchBookings]);

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
    if (res.ok) {
      window.location.reload();
    }
  }, [roomForm]);

  const hours = Array.from({ length: 13 }, (_, i) => String(i + 7));
  const mins = ["00", "15", "30", "45"];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Room Booking</h1>
          <p className="text-sm text-gray-500 mt-1">{rooms.length} room{rooms.length !== 1 ? "s" : ""} available</p>
        </div>
        <div className="flex gap-2">
          {isOps && (
            <button
              onClick={() => setShowAddRoom(true)}
              className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              + Room
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Book a room
          </button>
        </div>
      </div>

      {/* Room cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {rooms.map((r) => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-sm font-medium text-gray-900">{r.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {r.capacity ? `${r.capacity} people` : "—"}
              {r.location && ` · ${r.location}`}
            </p>
          </div>
        ))}
      </div>

      {/* Date selector + timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 py-4">Loading...</p>
        ) : (
          <TimelineGrid
            bookings={bookings}
            currentUserId={currentUserId}
            isOps={isOps}
            onCancel={handleCancel}
          />
        )}
      </div>

      {/* Today's list */}
      {bookings.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {date === todayStr ? "Today" : format(parseISO(date), "d MMM yyyy")}
          </h3>
          {bookings.map((b) => (
            <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{b.title}</p>
                <p className="text-xs text-gray-400">
                  {b.room?.name} · {format(parseISO(b.start_time), "h:mm a")} – {format(parseISO(b.end_time), "h:mm a")}
                  {b.booked_by_profile && ` · ${b.booked_by_profile.first_name} ${b.booked_by_profile.last_name}`}
                </p>
              </div>
              {(isOps || b.booked_by_profile?.id === currentUserId) && (
                <button
                  onClick={() => handleCancel(b.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Booking form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Book a Room</h2>
            <form onSubmit={handleBook} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Room *</label>
                <select
                  required
                  value={form.room_id}
                  onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date *</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  min={todayStr}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start *</label>
                  <div className="flex gap-1">
                    <select
                      value={form.start_hour}
                      onChange={(e) => setForm((f) => ({ ...f, start_hour: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {hours.map((h) => <option key={h} value={h}>{h.padStart(2,"0")}:00</option>)}
                    </select>
                    <select
                      value={form.start_min}
                      onChange={(e) => setForm((f) => ({ ...f, start_min: e.target.value }))}
                      className="w-14 border border-gray-200 rounded-lg px-1 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {mins.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End *</label>
                  <div className="flex gap-1">
                    <select
                      value={form.end_hour}
                      onChange={(e) => setForm((f) => ({ ...f, end_hour: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {hours.map((h) => <option key={h} value={h}>{h.padStart(2,"0")}:00</option>)}
                    </select>
                    <select
                      value={form.end_min}
                      onChange={(e) => setForm((f) => ({ ...f, end_min: e.target.value }))}
                      className="w-14 border border-gray-200 rounded-lg px-1 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {mins.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); }}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {creating ? "Booking..." : "Book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add room modal (OPS) */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Room</h2>
            <form onSubmit={handleAddRoom} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <input
                    type="text"
                    value={roomForm.location}
                    onChange={(e) => setRoomForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddRoom(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700"
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
