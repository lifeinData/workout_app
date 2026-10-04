import { Redirect } from "expo-router";

/**
 * `/` is where every cold start (and deep link to the app root) lands. Home
 * lives at `/home` so this can send everyone to Training, the only built-out
 * tab. The (tabs) layout's auth gate still bounces signed-out users to /login.
 */
export default function Index() {
  return <Redirect href="/training" />;
}
