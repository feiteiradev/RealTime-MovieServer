import { memo } from "react";
import type { FeedEntry } from "./protocol";
import { describeEntry } from "./feed";

/** Who did what in the Room, newest first. entries are oldest first, as the server sends them. */
export const ActivityFeed = memo(function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-2.5">
      <h2 id="activity" className="heading">
        Activity
      </h2>
      <ol aria-label="Activity Feed" className="flex flex-col gap-2.5">
        {[...entries].reverse().map((e, i) => (
          <li key={entries.length - i} className="flex gap-3 text-sm/snug text-soft">
            <time dateTime={new Date(e.at).toISOString()} className="shrink-0 pt-px font-mono text-[13px] text-muted">
              {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
            <span>{describeEntry(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
});
