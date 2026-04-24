type AvalonMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function AvalonMark({ size = 28, className, title = "Avalon" }: AvalonMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <g fill="currentColor">
        <g>
          <path d="M 30 24 L 32 2 L 34 24 Z" />
          <rect x="28.5" y="23" width="7" height="1.8" />
        </g>
        <g transform="rotate(90 32 32)">
          <path d="M 30 24 L 32 2 L 34 24 Z" />
          <rect x="28.5" y="23" width="7" height="1.8" />
        </g>
        <g transform="rotate(180 32 32)">
          <path d="M 30 24 L 32 2 L 34 24 Z" />
          <rect x="28.5" y="23" width="7" height="1.8" />
        </g>
        <g transform="rotate(270 32 32)">
          <path d="M 30 24 L 32 2 L 34 24 Z" />
          <rect x="28.5" y="23" width="7" height="1.8" />
        </g>
      </g>
      <g fill="currentColor" opacity="0.6">
        <path d="M 30.8 24 L 32 12 L 33.2 24 Z" transform="rotate(45 32 32)" />
        <path d="M 30.8 24 L 32 12 L 33.2 24 Z" transform="rotate(135 32 32)" />
        <path d="M 30.8 24 L 32 12 L 33.2 24 Z" transform="rotate(225 32 32)" />
        <path d="M 30.8 24 L 32 12 L 33.2 24 Z" transform="rotate(315 32 32)" />
      </g>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 32 25 L 39 32 L 32 39 L 25 32 Z M 32 28.5 L 35.5 32 L 32 35.5 L 28.5 32 Z"
      />
    </svg>
  );
}

type AvalonLockupProps = {
  className?: string;
  showEndorsement?: boolean;
};

export function AvalonLockup({ className, showEndorsement = true }: AvalonLockupProps) {
  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <AvalonMark size={22} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "var(--font-serif, 'Cormorant Garamond', serif)",
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: "0.14em",
            color: "var(--color-text-primary)",
          }}
        >
          AVALON
        </span>
        {showEndorsement && (
          <span
            style={{
              fontSize: 8.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
              marginTop: 2,
              fontWeight: 600,
            }}
          >
            By Finn Cotton
          </span>
        )}
      </div>
    </div>
  );
}
