"use client";

import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";

type Assignee = {
  id: string;
  user_id: string;
  profile: { first_name: string; last_name: string; avatar_url?: string | null } | null;
};

type Card = {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  completed_at: string | null;
  assignees?: Assignee[];
};

const priorityBorder: Record<string, string> = {
  low:    "border-l-4 border-l-zinc-300",
  medium: "border-l-4 border-l-blue-500",
  high:   "border-l-4 border-l-amber-500",
  urgent: "border-l-4 border-l-red-500",
};

function MiniAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-5 h-5 rounded-full object-cover border border-white shrink-0"
      />
    );
  }
  return (
    <div className="w-5 h-5 rounded-full bg-zinc-300 flex items-center justify-center text-[9px] font-medium text-zinc-700 border border-white shrink-0">
      {initials}
    </div>
  );
}

export function KanbanCard({
  card,
  onDragStart,
  onClick,
}: {
  card: Card;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const isOverdue =
    card.due_date && !card.completed_at && isPast(new Date(card.due_date));

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow",
        priorityBorder[card.priority ?? "low"]
      )}
    >
      <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100 mb-2">
        {card.title}
      </p>

      <div className="flex items-end justify-between">
        {card.due_date ? (
          <span className={cn("text-xs", isOverdue ? "text-red-500" : "text-zinc-400")}>
            {format(new Date(card.due_date), "MMM d")}
          </span>
        ) : (
          <span />
        )}
        <div className="flex -space-x-1 ml-auto">
          {card.assignees?.map((a) => (
            <MiniAvatar
              key={a.id}
              name={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : "?"}
              avatarUrl={a.profile?.avatar_url}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
