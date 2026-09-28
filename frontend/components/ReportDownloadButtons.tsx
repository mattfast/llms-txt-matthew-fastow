"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";

export function ReportDownloadButtons() {
  const [downloading, setDownloading] = useState<"csv" | "json" | null>(null);

  async function downloadReport(format: "csv" | "json") {
    setDownloading(format);
    try {
      const report = await apiFetch<unknown>(`/analytics/report?format=${format}`);
      if (format === "csv" && typeof report !== "string") {
        throw new Error("The server returned an unexpected report format.");
      }
      const content = typeof report === "string" ? report : JSON.stringify(report, null, 2);
      const objectUrl = URL.createObjectURL(
        new Blob([content], {
          type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `profound-site-health-report.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(`${format.toUpperCase()} report downloaded.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't download the report.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex gap-2">
      {(["csv", "json"] as const).map((format) => (
        <button
          key={format}
          type="button"
          onClick={() => void downloadReport(format)}
          disabled={downloading !== null}
          className="pill border border-border-subtle px-3 py-2 text-xs hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
        >
          {downloading === format ? "Preparing…" : `Download ${format.toUpperCase()}`}
        </button>
      ))}
    </div>
  );
}
