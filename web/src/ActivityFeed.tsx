import type { FeedEntry } from "./protocol";
import { describeEntry } from "./feed";

/** Who did what in the Room, newest first. entries are oldest first, as the server sends them. */
export function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  return (
    <section aria-labelledby="activity">
      <h2 id="activity" className="font-semibold">
        Activity
      </h2>
      <ol aria-label="Activity Feed">
        {[...entries].reverse().map((e, i) => (
          <li key={entries.length - i}>
            <time dateTime={new Date(e.at).toISOString()} className="mr-2 text-gray-500">
              {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
            {describeEntry(e)}
          </li>
        ))}
      </ol>
    </section>
  );
}
