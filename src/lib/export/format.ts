/**
 * Convert an array of objects to a CSV string.
 * Keys from the first row become headers.
 */
export function toCSV(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return "";

  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => `"${c.label}"`).join(",");

  const body = rows.map((row) =>
    cols
      .map((c) => {
        const val = row[c.key];
        if (val == null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  return [header, ...body].join("\n");
}

/**
 * Convert an array of objects to a Markdown table string.
 */
export function toMarkdown(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return "_No data_";

  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = `| ${cols.map((c) => c.label).join(" | ")} |`;
  const divider = `| ${cols.map(() => "---").join(" | ")} |`;

  const body = rows.map(
    (row) =>
      `| ${cols
        .map((c) => {
          const val = row[c.key];
          if (val == null) return "-";
          return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
        })
        .join(" | ")} |`
  );

  return [header, divider, ...body].join("\n");
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
