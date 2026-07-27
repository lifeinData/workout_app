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
