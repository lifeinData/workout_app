import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "@workout/auth-token";

/**
 * Query key for the currently-authenticated user. Centralised so the
 * (tabs) and (auth) gates, plus the login/signup/logout mutations,
 * all invalidate the same cache entry.
 */
export const ME_KEY = ["auth", "me"] as const;

/**
 * Tri-state token cache.
 *
 * The three states are:
 *   UNLOADED — getToken() has never been called; we don't yet know
 *              whether AsyncStorage has a token.
 *   null     — AsyncStorage has been read and contains no token
 *              (definitive "not signed in"). set/clear may also land
 *              here.
 *   string   — a real token is in memory.
 *
 * Using a Symbol sentinel prevents the cold-start race where a
 * concurrent getToken() (suspended on its first AsyncStorage read)
 * and clearToken() collide: the Symbol makes the distinction between
 * "haven't read yet" and "read, is null" impossible to confuse.
 */
const UNLOADED = Symbol("UNLOADED");
let cachedToken: string | null | typeof UNLOADED = UNLOADED;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== UNLOADED) return cachedToken;
  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  cachedToken = stored;
  return stored;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
}
