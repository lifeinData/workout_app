/**
 * Date utilities.
 *
 * Convention: ALL dates and timestamps sent to / received from the server
 * are UTC. The server stores `date` as `timestamp[:10]` (UTC YYYY-MM-DD)
 * and the API filter window (`/me/history?from=&to=`) is interpreted as
 * UTC dates. Mixing local and UTC produces sets that "move" between days
 * after every refetch.
 *
 * Local-time helpers (`localDateKey`, `localDateKeyDaysAgo`, `todayKeyLocal`)
 * are kept for client-only display logic — e.g. highlighting "today" on a
 * local calendar — but MUST NOT be passed to the server.
 */

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateKey(d);
}

export function todayKeyLocal(): string {
  return localDateKey(new Date());
}

export function fmtTimeLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Default title for a self-started (empty) workout, e.g.
 * `workout_2026_Aug_2_5:23PM`. Built manually (like `localDateKey`)
 * so the exact format is controlled and locale-independent. Purely a
 * client-side display default — the user can rename it, and the value
 * is just sent as the session `name`.
 */
export function fmtSessionDefaultName(d: Date): string {
  const y = d.getFullYear();
  const mon = MONTHS_SHORT[d.getMonth()];
  const day = d.getDate();
  const h24 = d.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `workout_${y}_${mon}_${day}_${h12}:${mm}${ampm}`;
}
