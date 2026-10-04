# External testing (a friend on their own phone)

How to let someone test the app on their iPhone or Android phone with **Expo Go**.

## What the tester does
1. Install **Expo Go** from the App Store or Play Store. It's free and doesn't need an
   account.
2. When you send the QR code (a screenshot of your terminal is fine) or the `exp://…` link,
   open it:
   - **iPhone:** with the **Camera** app, then tap the banner.
   - **Android:** with Expo Go's own scanner.
3. Sign up in the app, or use a seed account. `a`/`a` is an athlete with a coach, which
   shows off the coach features.

Only the **Training** tab works. Home, Nutrition and Community show "Coming soon".

## What you (the host) do

### Tester on the same Wi-Fi as you
1. Start the backend: `cd backend; .\run.bat`
2. Start Metro: `npx expo start`
3. Send them the QR code. The app finds your laptop's IP automatically.

### Tester somewhere else (any Wi-Fi or cellular)
Your laptop has to stay on and awake for the whole test.

1. Start the backend: `cd backend; .\run.bat`
2. Stop any Metro that's already running, since `share.ps1` starts its own.
3. From the project root, run:
   ```
   powershell -ExecutionPolicy Bypass -File .\share.ps1
   ```
   The script:
   - opens a free Cloudflare quick tunnel to the backend (no account needed);
   - points the app at that tunnel through `EXPO_PUBLIC_API_BASE_URL`;
   - starts Metro with `--tunnel --clear`.
4. Send them the QR code or `exp://` link it prints.
5. Press Ctrl+C when you're done. That stops Metro and the backend tunnel.

The tunnel URL changes on every run. Just re-run the script; nothing needs editing.

### One-time installs
These are already done on this machine.
- `winget install Cloudflare.cloudflared`
- `npm i -g @expo/ngrok@^4.1.0`, which Expo's `--tunnel` mode needs.

### Troubleshooting
- **"Backend isn't running on :8000"**: start `backend\run.bat` first.
- **The app shows "Could not reach the server"**: the backend tunnel died or the URL
  changed. Re-run `share.ps1`, and have the tester reload the app by shaking the phone →
  Reload.
- **This PC can't open the trycloudflare URL but the phone can**: local DNS (for example a
  VPN) is slow to pick up new hostnames. It's harmless; the script checks the tunnel through
  1.1.1.1 instead.
- **Expo Go says the SDK is incompatible**: the store version of Expo Go only runs the latest
  Expo SDK, so the project must be on it (SDK 57 as of 2026-10-04).

## Longer term
For testing without your laptop, build with **EAS** and distribute through **TestFlight**
(iOS, needs a $99/yr Apple Developer account) or an APK / internal track (Android). The
backend would then need a permanent host with a persistent disk, such as Railway, Render or
Fly. Vercel isn't suitable: its functions keep no files between requests, so SQLite data
would be lost.
