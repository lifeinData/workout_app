import type { UserPublic } from "@/lib/api";

/** A coach's (or any user's) display name: `display_name`, falling back to
 * `username`. Render it as `Coach {coachName(u)}` wherever a coach is named
 * (agenda D6/D10). Blank display names fall back too. */
export function coachName(u: Pick<UserPublic, "display_name" | "username">): string {
  const display = u.display_name?.trim();
  return display ? display : u.username;
}
