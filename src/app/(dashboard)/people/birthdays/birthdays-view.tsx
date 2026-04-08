"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
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

type CardResponse = {
  card: BirthdayCard | null;
  messages: BirthdayMessage[];
  canSign: boolean;
  birthdayStatus: "today" | "past" | "future" | "expired";
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
  const [query, setQuery]     = useState("");
  const [gifs, setGifs]       = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
    if (!apiKey) { setNoKey(true); return; }

    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q.trim())}&limit=12&rating=g`
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

  // Load trending immediately on mount
  useEffect(() => { search(""); }, [search]);

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 400);
  };

  if (noKey) {
    return (
      <p className="text-white/40 text-xs text-center py-3">
        NEXT_PUBLIC_GIPHY_API_KEY not set — GIF search unavailable.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search GIFs…"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {loading && (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && gifs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 rounded-lg">
          {gifs.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="rounded overflow-hidden hover:ring-2 hover:ring-amber-400 transition-all bg-white/5"
            >
              {/* plain img — next/image doesn't handle animated GIFs well */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.preview}
                alt={g.title}
                className="w-full h-auto"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      <p className="text-white/20 text-[10px] text-right">Powered by Giphy</p>
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
  const [card, setCard]           = useState<BirthdayCard | null>(null);
  const [messages, setMessages]   = useState<BirthdayMessage[]>([]);
  const [canSign, setCanSign]     = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<"messages" | "sign">("messages");

  // Sign form state
  const [msgText, setMsgText] = useState("");
  const [selectedGif, setSelectedGif] = useState<GifResult | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [photoFile, setPhotoFile]         = useState<File | null>(null);
  const [photoPreview, setPhotoPreview]   = useState<string | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCelebrant = person.id === currentUserId;

  const loadCard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/birthday-cards/${person.id}`);
      if (res.status === 403) { setForbidden(true); setLoading(false); return; }
      if (!res.ok) { setLoading(false); return; }
      const json: CardResponse = await res.json();
      if (json.card) {
        setCard(json.card);
        setMessages(json.messages ?? []);
        setCanSign(json.canSign ?? false);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [person.id]);

  // Load on mount
  useEffect(() => { loadCard(); }, [loadCard]);

  const myMessage   = messages.find((m) => m.author_id === currentUserId);
  const showSignTab = canSign && !isCelebrant;

  const clearAttachment = () => {
    setSelectedGif(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowGifPicker(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitError("Image must be under 10 MB");
      return;
    }
    setSelectedGif(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setShowGifPicker(false);
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (!msgText.trim()) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      let attachmentUrl: string | null = selectedGif?.url ?? null;

      // Upload photo if one was chosen
      if (photoFile) {
        setUploading(true);
        const supabase = createClient();
        const ext      = photoFile.name.split(".").pop() ?? "jpg";
        const path     = `${person.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("birthday-photos")
          .upload(path, photoFile, { upsert: true });
        setUploading(false);

        if (uploadError) {
          setSubmitError("Photo upload failed: " + uploadError.message);
          setSubmitting(false);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("birthday-photos")
          .getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }

      const res = await fetch(`/api/birthday-cards/${person.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgText.trim(),
          gif_url: attachmentUrl,
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
      clearAttachment();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch(`/api/birthday-cards/${person.id}/messages`, { method: "DELETE" });
      await loadCard();
      setMsgText("");
      clearAttachment();
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-gray-900 rounded-2xl shadow-2xl border border-white/10 flex flex-col" style={{ maxHeight: "90vh" }}>

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
          {showSignTab && (
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

        {/* Body — scrolls independently, header + tabs stay fixed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : forbidden ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="text-3xl">🔒</span>
              <p className="text-white/50 text-sm">
                This card is now private — only visible to the birthday person.
              </p>
            </div>
          ) : tab === "messages" ? (
            <>
              {!canSign && !isCelebrant && messages.length === 0 && (
                <p className="text-center text-white/30 text-xs py-2 pb-0">
                  This card is now closed — no messages were left.
                </p>
              )}
              {!canSign && messages.length > 0 && (
                <p className="text-center text-white/30 text-xs pb-1">
                  This card is read-only — signing closed after the birthday.
                </p>
              )}
              {messages.length === 0 && canSign ? (
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
                      <div className="rounded-lg overflow-hidden max-h-64">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.gif_url}
                          alt="attachment"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {/* Only show remove button on the birthday day itself */}
                    {m.author_id === currentUserId && canSign && (
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

              {/* Attachment preview — GIF or photo */}
              {(selectedGif || photoPreview) && (
                <div className="relative rounded-lg overflow-hidden max-h-52 bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedGif ? selectedGif.preview : photoPreview!}
                    alt="Attachment"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={clearAttachment}
                    className="absolute top-2 right-2 bg-black/70 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-black/90"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Attachment buttons — only shown when nothing is selected */}
              {!selectedGif && !photoPreview && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {showGifPicker ? "Hide GIFs" : "Add GIF 🎞️"}
                  </button>
                  <span className="text-white/20 text-xs">or</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Upload photo 📷
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              )}

              {showGifPicker && !selectedGif && !photoPreview && (
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
                disabled={submitting || uploading || !msgText.trim()}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploading photo…</>
                ) : submitting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
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
  myRecentBirthdayDaysAgo,
  myRecentBirthdayPerson,
}: {
  todayPeople: BirthdayPerson[];
  thisWeek: BirthdayPerson[];
  thisMonth: BirthdayPerson[];
  upcoming: BirthdayPerson[];
  currentUserId: string;
  currentUserHasBirthday: boolean;
  myRecentBirthdayDaysAgo: number | null;
  myRecentBirthdayPerson: BirthdayPerson | null;
}) {
  const [myCardOpen, setMyCardOpen] = useState(false);
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

      {myRecentBirthdayDaysAgo !== null && myRecentBirthdayPerson && (
        <>
          <div className="mb-6 rounded-xl bg-gray-50 border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎂</span>
              <p className="text-gray-700 text-sm">
                Your birthday was{" "}
                <span className="font-medium">
                  {myRecentBirthdayDaysAgo === 1 ? "yesterday" : `${myRecentBirthdayDaysAgo} days ago`}
                </span>
                . Your card closes in{" "}
                <span className="font-medium">{7 - myRecentBirthdayDaysAgo} more {7 - myRecentBirthdayDaysAgo === 1 ? "day" : "days"}</span>.
              </p>
            </div>
            <button
              onClick={() => setMyCardOpen(true)}
              className="shrink-0 text-sm font-medium text-[#3A5635] hover:underline"
            >
              View my card →
            </button>
          </div>
          {myCardOpen && (
            <BirthdayCardModal
              person={myRecentBirthdayPerson}
              currentUserId={currentUserId}
              onClose={() => setMyCardOpen(false)}
            />
          )}
        </>
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
