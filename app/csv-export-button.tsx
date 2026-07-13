"use client";

// Downloads the rows it's handed as a CSV, entirely client-side (Blob +
// object URL) — no API route, nothing leaves the page.

export default function CsvExportButton({
  rows,
  filename,
  label = "export csv",
}: {
  rows: Record<string, string | number | null>[];
  filename: string;
  label?: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const escape = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className="btn"
      onClick={download}
      style={{ fontSize: 11, borderRadius: 999, padding: "4px 12px" }}
      title={`Download ${rows.length} rows as CSV`}
    >
      {label}
    </button>
  );
}
