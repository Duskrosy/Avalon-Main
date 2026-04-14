"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, isToday } from "date-fns";

/* ─── Types ────────────────────────────────────────────────── */

type OrderRef = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_price: number;
};

type CourierEvent = {
  id: string;
  dispatch_id: string;
  event_type: string;
  event_time: string;
  location: string | null;
  courier_name: string | null;
  external_ref: string | null;
  notes: string | null;
  created_at: string;
};

type Shipment = {
  id: string;
  order_id: string;
  status: string;
  courier_name: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  created_at: string;
  order: OrderRef | null;
  latest_event: CourierEvent | null;
};

type Props = {
  initialShipments: Shipment[];
};

/* ─── Constants ────────────────────────────────────────────── */

const EVENT_TYPES = [
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed_attempt",
  "returned_to_sender",
  "rts_received",
  "redelivery_scheduled",
  "other",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

const EVENT_LABEL: Record<EventType, string> = {
  picked_up: "Picked Up",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed_attempt: "Failed Attempt",
  returned_to_sender: "Returned to Sender",
  rts_received: "RTS Received",
  redelivery_scheduled: "Redelivery Scheduled",
  other: "Other",
};

const EVENT_DOT_COLOR: Record<EventType, string> = {
  picked_up: "bg-blue-500",
  in_transit: "bg-indigo-500",
  out_for_delivery: "bg-amber-500",
  delivered: "bg-green-500",
  failed_attempt: "bg-red-500",
  returned_to_sender: "bg-red-500",
  rts_received: "bg-purple-500",
  redelivery_scheduled: "bg-yellow-500",
  other: "bg-gray-400",
};

const EVENT_BADGE: Record<EventType, string> = {
  picked_up: "bg-blue-50 text-blue-700",
  in_transit: "bg-indigo-50 text-indigo-700",
  out_for_delivery: "bg-amber-50 text-amber-700",
  delivered: "bg-green-50 text-green-700",
  failed_attempt: "bg-red-50 text-red-700",
  returned_to_sender: "bg-red-50 text-red-600",
  rts_received: "bg-purple-50 text-purple-700",
  redelivery_scheduled: "bg-yellow-50 text-yellow-700",
  other: "bg-gray-100 text-gray-600",
};

function formatDateTime(d: string | null) {
  if (!d) return "\u2014";
  try {
    return format(parseISO(d), "d MMM yyyy HH:mm");
  } catch {
    return "\u2014";
  }
}

function toLocalDatetimeValue(d?: Date): string {
  const dt = d ?? new Date();
  const offset = dt.getTimezoneOffset();
  const local = new Date(dt.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/* ─── Component ────────────────────────────────────────────── */

export function CourierView({ initialShipments }: Props) {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>(initialShipments);
  const [search, setSearch] = useState("");

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<CourierEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Add event modal
  const [showModal, setShowModal] = useState(false);
  const [modalDispatchId, setModalDispatchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_type: "in_transit" as string,
    event_time: toLocalDatetimeValue(),
    location: "",
    notes: "",
  });

  /* ─── Refresh ──────────────────────────────────────────────── */

  const fetchShipments = useCallback(async () => {
    const res = await fetch("/api/operations/courier");
    if (res.ok) {
      const json = await res.json();
      setShipments(json.data ?? []);
    }
  }, []);

  /* ─── Search filter ────────────────────────────────────────── */

  const filtered = shipments.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.tracking_number ?? "").toLowerCase().includes(q) ||
      (s.order?.order_number ?? "").toLowerCase().includes(q) ||
      (s.courier_name ?? "").toLowerCase().includes(q)
    );
  });

  /* ─── Summary cards ────────────────────────────────────────── */

  const inTransitCount = shipments.filter(
    (s) =>
      s.latest_event?.event_type === "in_transit" ||
      s.latest_event?.event_type === "picked_up"
  ).length;

  const outForDeliveryCount = shipments.filter(
    (s) => s.latest_event?.event_type === "out_for_delivery"
  ).length;

  const deliveredTodayCount = shipments.filter((s) => {
    if (s.latest_event?.event_type !== "delivered") return false;
    try {
      return isToday(parseISO(s.latest_event.event_time));
    } catch {
      return false;
    }
  }).length;

  const failedRtsCount = shipments.filter(
    (s) =>
      s.latest_event?.event_type === "failed_attempt" ||
      s.latest_event?.event_type === "returned_to_sender" ||
      s.latest_event?.event_type === "rts_received"
  ).length;

  /* ─── Timeline expand ─────────────────────────────────────── */

  async function toggleExpand(dispatchId: string) {
    if (expandedId === dispatchId) {
      setExpandedId(null);
      setTimelineEvents([]);
      return;
    }

    setExpandedId(dispatchId);
    setLoadingTimeline(true);
    const res = await fetch(
      `/api/operations/courier?events=true&dispatch_id=${dispatchId}`
    );
    if (res.ok) {
      const json = await res.json();
      setTimelineEvents(json.data ?? []);
    }
    setLoadingTimeline(false);
  }

  /* ─── Add event modal ─────────────────────────────────────── */

  function openAddEvent(dispatchId: string) {
    setModalDispatchId(dispatchId);
    setEventForm({
      event_type: "in_transit",
      event_time: toLocalDatetimeValue(),
      location: "",
      notes: "",
    });
    setShowModal(true);
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!modalDispatchId) return;
    setSaving(true);

    const payload = {
      dispatch_id: modalDispatchId,
      event_type: eventForm.event_type,
      event_time: new Date(eventForm.event_time).toISOString(),
      location: eventForm.location || null,
      notes: eventForm.notes || null,
    };

    const res = await fetch("/api/operations/courier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(false);
      // Refresh data
      router.refresh();
      await fetchShipments();
      // If this dispatch is expanded, refresh timeline
      if (expandedId === modalDispatchId) {
        const evRes = await fetch(
          `/api/operations/courier?events=true&dispatch_id=${modalDispatchId}`
        );
        if (evRes.ok) {
          const json = await evRes.json();
          setTimelineEvents(json.data ?? []);
        }
      }
    }
    setSaving(false);
  }

  /* ─── Render ────────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Courier Tracking
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {shipments.length} shipment{shipments.length !== 1 ? "s" : ""} with
          tracking
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="In Transit"
          count={inTransitCount}
          color="bg-indigo-50 text-indigo-700"
          dotColor="bg-indigo-500"
        />
        <SummaryCard
          label="Out for Delivery"
          count={outForDeliveryCount}
          color="bg-amber-50 text-amber-700"
          dotColor="bg-amber-500"
        />
        <SummaryCard
          label="Delivered Today"
          count={deliveredTodayCount}
          color="bg-green-50 text-green-700"
          dotColor="bg-green-500"
        />
        <SummaryCard
          label="Failed / RTS"
          count={failedRtsCount}
          color="bg-red-50 text-red-700"
          dotColor="bg-red-500"
        />
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by tracking #, order #, or courier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Shipment List */}
      {filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            {shipments.length === 0
              ? "No dispatches with tracking numbers yet."
              : "No shipments match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const isExpanded = expandedId === s.id;
            const eventType = (s.latest_event?.event_type ?? "other") as EventType;
            return (
              <div
                key={s.id}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Row */}
                <div
                  onClick={() => toggleExpand(s.id)}
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors flex-wrap"
                >
                  {/* Order # */}
                  <div className="min-w-[100px]">
                    <p className="text-[11px] text-gray-400 uppercase font-medium">
                      Order
                    </p>
                    <p className="text-sm font-mono font-medium text-gray-900">
                      {s.order?.order_number ?? "\u2014"}
                    </p>
                  </div>

                  {/* Tracking # */}
                  <div className="min-w-[140px]">
                    <p className="text-[11px] text-gray-400 uppercase font-medium">
                      Tracking
                    </p>
                    <p className="text-sm font-mono text-gray-700">
                      {s.tracking_number ?? "\u2014"}
                    </p>
                  </div>

                  {/* Courier */}
                  <div className="min-w-[100px]">
                    <p className="text-[11px] text-gray-400 uppercase font-medium">
                      Courier
                    </p>
                    <p className="text-sm text-gray-700">
                      {s.courier_name ?? "\u2014"}
                    </p>
                  </div>

                  {/* Latest Status Badge */}
                  <div className="min-w-[120px]">
                    <p className="text-[11px] text-gray-400 uppercase font-medium">
                      Status
                    </p>
                    {s.latest_event ? (
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          EVENT_BADGE[eventType] ?? EVENT_BADGE.other
                        }`}
                      >
                        {EVENT_LABEL[eventType] ?? eventType}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">No events</span>
                    )}
                  </div>

                  {/* Latest Event Time */}
                  <div className="min-w-[130px]">
                    <p className="text-[11px] text-gray-400 uppercase font-medium">
                      Last Update
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(s.latest_event?.event_time ?? null)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddEvent(s.id);
                      }}
                      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      + Event
                    </button>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Expanded Timeline */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    {loadingTimeline ? (
                      <p className="text-sm text-gray-400 py-4 text-center">
                        Loading timeline...
                      </p>
                    ) : timelineEvents.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">
                        No events recorded yet.
                      </p>
                    ) : (
                      <div className="relative pl-6">
                        {/* Vertical line */}
                        <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200" />

                        {timelineEvents.map((ev, idx) => {
                          const evType = (ev.event_type ?? "other") as EventType;
                          return (
                            <div
                              key={ev.id}
                              className="relative flex gap-4 pb-5 last:pb-0"
                            >
                              {/* Dot */}
                              <div
                                className={`absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-white ${
                                  EVENT_DOT_COLOR[evType] ?? EVENT_DOT_COLOR.other
                                } shadow-sm`}
                              />

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      EVENT_BADGE[evType] ?? EVENT_BADGE.other
                                    }`}
                                  >
                                    {EVENT_LABEL[evType] ?? evType}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {formatDateTime(ev.event_time)}
                                  </span>
                                </div>
                                {(ev.location || ev.notes || ev.courier_name) && (
                                  <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                                    {ev.location && (
                                      <p>
                                        <span className="font-medium text-gray-600">
                                          Location:
                                        </span>{" "}
                                        {ev.location}
                                      </p>
                                    )}
                                    {ev.courier_name && (
                                      <p>
                                        <span className="font-medium text-gray-600">
                                          Courier:
                                        </span>{" "}
                                        {ev.courier_name}
                                      </p>
                                    )}
                                    {ev.notes && (
                                      <p>
                                        <span className="font-medium text-gray-600">
                                          Notes:
                                        </span>{" "}
                                        {ev.notes}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Add Courier Event
            </h2>
            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Event Type *
                </label>
                <select
                  required
                  value={eventForm.event_type}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, event_type: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Event Time
                </label>
                <input
                  type="datetime-local"
                  value={eventForm.event_time}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, event_time: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Manila Hub, Makati Office..."
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, location: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={eventForm.notes}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Add Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Summary Card ────────────────────────────────────────── */

function SummaryCard({
  label,
  count,
  color,
  dotColor,
}: {
  label: string;
  count: number;
  color: string;
  dotColor: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold">{count}</p>
    </div>
  );
}
