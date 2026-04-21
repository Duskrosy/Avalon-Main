"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type PickerUser = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  department_id?: string | null;
};

function getInitials(user: PickerUser): string {
  return `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase();
}

function getFullName(user: PickerUser): string {
  return `${user.first_name} ${user.last_name}`;
}

type PeoplePickerProps = {
  value: string[];
  onChange: (ids: string[]) => void;
  allUsers: PickerUser[];
  currentDeptId?: string | null;
  placeholder?: string;
  single?: boolean;
};

export function PeoplePicker({
  value,
  onChange,
  allUsers,
  currentDeptId,
  placeholder = "Search people…",
  single = false,
}: PeoplePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Close on outside click — allow clicks inside portal dropdown too
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideContainer && !insideDropdown) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Position the portal dropdown under the input, re-measure on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuStyle({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  // Build sorted + filtered list
  const filteredUsers = useCallback((): PickerUser[] => {
    const q = query.trim().toLowerCase();

    const matches = allUsers.filter((u) => {
      if (q === "") return true;
      return getFullName(u).toLowerCase().includes(q);
    });

    if (q !== "") {
      // When searching: pure alphabetical
      return matches
        .sort((a, b) => getFullName(a).localeCompare(getFullName(b)))
        .slice(0, 20);
    }

    // Default: dept-first, then alphabetical within each group
    const inDept: PickerUser[] = [];
    const others: PickerUser[] = [];

    for (const u of matches) {
      if (currentDeptId && u.department_id === currentDeptId) {
        inDept.push(u);
      } else {
        others.push(u);
      }
    }

    inDept.sort((a, b) => getFullName(a).localeCompare(getFullName(b)));
    others.sort((a, b) => getFullName(a).localeCompare(getFullName(b)));

    return [...inDept, ...others].slice(0, 20);
  }, [allUsers, query, currentDeptId]);

  const selectedUsers = value
    .map((id) => allUsers.find((u) => u.id === id))
    .filter(Boolean) as PickerUser[];

  function handleSelect(user: PickerUser) {
    if (single) {
      onChange([user.id]);
      setOpen(false);
      setQuery("");
      return;
    }
    if (value.includes(user.id)) {
      onChange(value.filter((id) => id !== user.id));
    } else {
      onChange([...value, user.id]);
    }
  }

  function handleRemove(userId: string) {
    onChange(value.filter((id) => id !== userId));
  }

  function handleInputClick() {
    setOpen(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
  }

  const options = filteredUsers();

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Selected chips (multi mode) */}
      {!single && selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]"
            >
              <Avatar
                url={user.avatar_url}
                initials={getInitials(user)}
                size="xs"
              />
              {getFullName(user)}
              <button
                type="button"
                onClick={() => handleRemove(user.id)}
                className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
                aria-label={`Remove ${getFullName(user)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Single-mode selected display */}
      {single && selectedUsers.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            <Avatar
              url={selectedUsers[0].avatar_url}
              initials={getInitials(selectedUsers[0])}
              size="xs"
            />
            {getFullName(selectedUsers[0])}
            <button
              type="button"
              onClick={() => onChange([])}
              className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
              aria-label={`Remove ${getFullName(selectedUsers[0])}`}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onClick={handleInputClick}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)]",
          "bg-[var(--color-bg-primary)] px-3 py-2 text-sm",
          "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]",
          "outline-none focus:border-[var(--color-border-focus)] focus:ring-1 focus:ring-[var(--color-border-focus)]",
          "transition-colors"
        )}
        autoComplete="off"
      />

      {/* Dropdown — portaled to body so it escapes overflow:hidden table containers */}
      {mounted && open && menuStyle && (options.length > 0 || query.length > 0) && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
          className={cn(
            "z-[9999] rounded-[var(--radius-md)]",
            "bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]",
            "shadow-[var(--shadow-md)] overflow-y-auto max-h-60"
          )}
        >
          {options.length > 0 ? (
            options.map((user) => {
              const isSelected = value.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(user);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left",
                    "text-[var(--color-text-primary)] transition-colors",
                    isSelected
                      ? "bg-[var(--color-accent-light)]"
                      : "hover:bg-[var(--color-surface-hover)]"
                  )}
                >
                  <Avatar
                    url={user.avatar_url}
                    initials={getInitials(user)}
                    size="xs"
                  />
                  <span className="flex-1 truncate">{getFullName(user)}</span>
                  {isSelected && (
                    <span className="text-[var(--color-accent)] text-xs font-semibold">✓</span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-sm text-[var(--color-text-tertiary)]">
              No people found
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
