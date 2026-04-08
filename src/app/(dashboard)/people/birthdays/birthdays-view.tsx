"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import type { BirthdayPerson } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type BirthdayMessage = {
  id: string;
  author_id: string;
  message: string;
  gif_url: string | null;
  emoji: string | null;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
};

type BirthdayCard = {
  id: string;
  expires_at: string;
  created_at: string;
};

type GifResult = {
  id: string;
  url: string;
  preview: string;
  title: string;
};

// ─── Avatar with birthday ring ────────────────────────────────────────────────

function BirthdayAvatar({
  person,
  isToday,
}: {
  person: BirthdayPerson;
  isToday: boolean;
}) {
  const initials = `${person.first_name[0]}${person.last_name[0]}`;

  if (isToday) {
    return (
      <div className="relative shrink-0">
        {/* Rainbow-ish birthday ring */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            background:
              "conic-gradient(from 0deg, #f59e0b, #ec4899, #8b5cf6, #3b82f6, #10b981, #f59e0b)",
            padding: 2,
            borderRadius: "9999px",
            animationDuration: "3s",
          }}
        />
        <div className="relative z-10 p-[3px]">
          <Avatar
            url={person.avatar_url}
            initials={initials}
            size="md"
          />
        </div>
      </div>
    );
  }

  return <Avatar url={person.avatar_url} initials={initials} size="md" />;
}

// ─── Giphy search ─────────────────────────────────────────────────────────────

function GifPicker({ onSelect }: { onSelect: (gif: GifResult) => void }) {
  const [query, setQuery]   = useState("");
  const [gifs, setGifs]     = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
    if (!apiKey || q.trim().length < 2) { setGifs([]); return; }

    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=12&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=12&rating=g`;

      const res  = await fetch(endpoint);
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGifs((json.data ?? []).map((g: any) => ({
        id:      g.id,
        url:     g.images.original.url,
        preview: g.images.fixed_height_small.url,
        title:   g.title,
      })));
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 400);
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search GIFs… (powered by Giphy)"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {loading && (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {gifs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
          {gifs.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="aspect-video rounded overflow-hidden hover:ring-2 hover:ring-amber-400 transition-all"
            >
              <Image
                src={g.preview}
                alt={g.title}
                width={120}
                height={90}
                className="w-full h-full object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Birthday Card Modal ───────────────────────────────────────────────────────

function BirthdayCardModal({
  person,
  currentUserId,
  onClose,
}: {
  person: BirthdayPerson;
  currentUserId: string;
  onClose: () => void;
}) {
  const [card, setCard]         = useState<BirthdayCard | null>(null);
  const [messages, setMessages] = useState<BirthdayMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"messages" | "sign">("messages");

  // Sign form state
  const [msgText, setMsgText] = useState("");
  const [selectedGif, setSelectedGif] = useState<GifResult | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const isCelebrant = person.id === currentUserId;

  const loadCard = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/birthday-cards/${person.id}`);
      const json = await res.json();
      if (json.card) {
        setCard(json.card);
        setMessages(json.messages ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [person.id]);

  // Load on mount
  useEffect(() => { loadCard(); }, [loadCard]);

  const myMessage = messages.find((m) => m.author_id === currentUserId);

  const handleSubmit = async () => {
    if (!msgText.trim()) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(`/api/birthday-cards/${person.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText.trim(),
          gif_url: selectedGif?.url ?? null,
          emoji: null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setSubmitError(json.error ?? "Failed to save message");
        return;
      }
      await loadCard();
      setTab("messages");
      setMsgText("");
      setSelectedGif(null);
      setShowGifPicker(false);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch(`/api/birthday-cards/${person.id}/messages`, { method: "DELETE" });
      await loadCard();
      setMsgText("");
      setSelectedGif(null);
    } catch {
      // ignore
    }
  };

  const isExpired = card ? new Date(card.expires_at) < new Date() : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#3A5635] to-[#4e7349] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎂</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-lg leading-tight">
                Happy Birthday, {person.first_name}!
              </h2>
              <p className="text-white/60 text-sm">
                {format(new Date(person.nextBirthday), "MMMM d")}
                {person.age && ` · Turning ${person.age}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors text-xl leading-none shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-gray-900">
          <button
            onClick={() => setTab("messages")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "messages"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            Messages {messages.length > 0 && `(${messages.length})`}
          </button>
          {!isCelebrant && !isExpired && (
            <button
              onClick={() => { setTab("sign"); if (myMessage) { setMsgText(myMessage.message); setSelectedGif(myMessage.gif_url ? { id: "", url: myMessage.gif_url, preview: myMessage.gif_url, title: "" } : null); } }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === "sign"
                  ? "text-amber-400 border-b-2 border-amber-400"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {myMessage ? "Edit my message" : "Sign the card ✍️"}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === "messages" ? (
            <>
              {messages.length === 0 ? (
                <p className="text-center text-white/40 text-sm py-8">
                  {isCelebrant
                    ? "No messages yet — wait for your teammates to sign! 🎉"
                    : "No messages yet. Be the first to sign the card!"}
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="bg-white/5 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar
                        url={m.author?.avatar_url ?? null}
                        initials={m.author ? `${m.author.first_name[0]}${m.author.last_name[0]}` : "?"}
                        size="xs"
                      />
                      <span className="text-white/80 text-xs font-medium">
                        {m.author ? `${m.author.first_name} ${m.author.last_name}` : "Anonymous"}
                      </span>
                      <span className="text-white/30 text-xs ml-auto">
                        {format(new Date(m.created_at), "MMM d")}
                      </span>
                    </div>
                    <p className="text-white text-sm leading-relaxed">{m.message}</p>
                    {m.gif_url && (
                      <div className="rounded-lg overflow-hidden max-h-40">
                        <Image
                          src={m.gif_url}
                          alt="GIF"
                          width={400}
                          height={160}
                          className="w-full object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                    {m.author_id === currentUserId && (
                      <button
                        onClick={handleDelete}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove my message
                      </button>
                    )}
                  </div>
                ))
              )}
            </>
          ) : (
            /* Sign form */
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-xs mb-1.5 uppercase tracking-wide">
                  Your message <span className="text-white/30">({280 - msgText.length} left)</span>
                </label>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder={`Write a birthday message for ${person.first_name}…`}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Selected GIF preview */}
              {selectedGif && (
                <div className="relative rounded-lg overflow-hidden max-h-36">
                  <Image
                    src={selectedGif.preview}
                    alt="Selected GIF"
                    width={400}
                    height={144}
                    className="w-full object-cover"
                    unoptimized
                  />
                  <button
                    onClick={() => { setSelectedGif(null); setShowGifPicker(false); }}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-black/80"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* GIF toggle */}
              {!selectedGif && (
                <button
                  onClick={() => setShowGifPicker(!showGifPicker)}
                  className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {showGifPicker ? "Hide GIF picker" : "Add a GIF 🎞️"}
                </button>
              )}

              {showGifPicker && !selectedGif && (
                <GifPicker
                  onSelect={(g) => {
                    setSelectedGif(g);
                    setShowGifPicker(false);
                  }}
                />
              )}

              {submitError && (
                <p className="text-red-400 text-sm">{submitError}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !msgText.trim()}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : myMessage ? "Update message" : "Sign the card ✍️"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Birthday Card row ────────────────────────────────────────────────────────

function BirthdayCard({
  person,
  isToday,
  currentUserId,
}: {
  person: BirthdayPerson;
  isToday: boolean;
  currentUserId: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isCelebrant = person.id === currentUserId;

  return (
    <>
      <div
        className={`bg-white rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow ${
          isToday ? "border-amber-300 bg-amber-50" : "border-gray-200"
        }`}
        onClick={() => setModalOpen(true)}
      >
        <BirthdayAvatar person={person} isToday={isToday} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            {person.first_name} {person.last_name}
            {isToday && <span className="text-amber-600 text-xs">🎂</span>}
            {isCelebrant && isToday && (
              <span className="text-xs text-amber-600 font-normal">(you!)</span>
            )}
            {person.age && (
              <span className="text-xs font-normal text-gray-400">turns {person.age}</span>
            )}
          </p>
          {person.department && (
            <p className="text-xs text-gray-400">{person.department.name}</p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-medium text-gray-700">
            {format(new Date(person.nextBirthday), "MMM d")}
          </p>
          {isToday ? (
            <p className="text-xs text-amber-600 font-medium">Today!</p>
          ) : (
            <p className="text-xs text-gray-400">in {person.daysUntil}d</p>
          )}
        </div>
      </div>

      {modalOpen && (
        <BirthdayCardModal
          person={person}
          currentUserId={currentUserId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  people,
  emptyMsg,
  currentUserId,
  isToday = false,
}: {
  title: string;
  people: BirthdayPerson[];
  emptyMsg: string;
  currentUserId: string;
  isToday?: boolean;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {people.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">{emptyMsg}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((p) => (
            <BirthdayCard
              key={p.id}
              person={p}
              isToday={isToday}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page View ────────────────────────────────────────────────────────────────

export function BirthdaysView({
  todayPeople,
  thisWeek,
  thisMonth,
  upcoming,
  currentUserId,
  currentUserHasBirthday,
}: {
  todayPeople: BirthdayPerson[];
  thisWeek: BirthdayPerson[];
  thisMonth: BirthdayPerson[];
  upcoming: BirthdayPerson[];
  currentUserId: string;
  currentUserHasBirthday: boolean;
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Birthday Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upcoming birthdays across the team · click any card to leave a message
        </p>
      </div>

      {currentUserHasBirthday && (
        <div className="mb-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <p className="text-amber-800 font-medium text-sm">
            Happy Birthday! Your teammates can leave you a birthday card message today.
          </p>
        </div>
      )}

      <div className="space-y-8">
        <Section
          title="🎂 Today"
          people={todayPeople}
          emptyMsg="No birthdays today"
          currentUserId={currentUserId}
          isToday
        />
        <Section
          title="This week"
          people={thisWeek}
          emptyMsg="No birthdays this week"
          currentUserId={currentUserId}
        />
        <Section
          title="This month"
          people={thisMonth}
          emptyMsg="No more birthdays this month"
          currentUserId={currentUserId}
        />
        <Section
          title="Upcoming"
          people={upcoming}
          emptyMsg="Nothing beyond this month"
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
