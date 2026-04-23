import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg-primary, #0a0a0a)",
        color: "var(--color-text-primary, #f5f5f5)",
        fontFamily: "inherit",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "72px", fontWeight: 600, lineHeight: 1, marginBottom: "16px" }}>404</div>
      <div style={{ fontSize: "18px", opacity: 0.8, marginBottom: "8px" }}>
        This page could not be found.
      </div>
      <div style={{ fontSize: "14px", opacity: 0.6, marginBottom: "32px" }}>
        The link may be out of date, or the page was moved.
      </div>
      <Link
        href="/"
        style={{
          fontSize: "14px",
          padding: "10px 20px",
          borderRadius: "8px",
          border: "1px solid var(--color-border, #2a2a2a)",
          color: "inherit",
          textDecoration: "none",
          background: "var(--color-bg-secondary, #141414)",
        }}
      >
        Back to Avalon
      </Link>
    </div>
  );
}
