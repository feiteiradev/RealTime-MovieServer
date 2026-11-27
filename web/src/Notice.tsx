import type { ReactNode } from "react";

/** An error (role alert) or a warning that doesn't block (role status). */
export function Notice({ tone, children }: { tone: "danger" | "warn"; children: ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm/snug ${tone === "danger" ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn"}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-px size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {tone === "danger" ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></> : <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>}
      </svg>
      <span>{children}</span>
    </p>
  );
}
