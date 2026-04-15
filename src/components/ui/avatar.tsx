import Image from "next/image";
import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, { wrapper: string; text: string }> = {
  xs: { wrapper: "w-6 h-6",   text: "text-[10px]" },
  sm: { wrapper: "w-8 h-8",   text: "text-xs" },
  md: { wrapper: "w-10 h-10", text: "text-sm" },
  lg: { wrapper: "w-14 h-14", text: "text-base" },
  xl: { wrapper: "w-20 h-20", text: "text-xl" },
};

type AvatarProps = {
  url?: string | null;
  initials: string;
  size?: AvatarSize;
  className?: string;
};

export function Avatar({ url, initials, size = "sm", className }: AvatarProps) {
  const { wrapper, text } = SIZE_CLASSES[size];

  if (url) {
    return (
      <div className={cn("rounded-full overflow-hidden shrink-0 bg-[var(--color-bg-tertiary)]", wrapper, className)}>
        <Image
          src={url}
          alt={initials}
          width={80}
          height={80}
          className="w-full h-full object-cover"
          unoptimized // avatars are served from Supabase storage with cache-bust params
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-full bg-[var(--color-text-primary)] flex items-center justify-center text-white font-semibold shrink-0",
      wrapper, text, className
    )}>
      {initials.toUpperCase().slice(0, 2)}
    </div>
  );
}
