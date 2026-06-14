# Lessons Learned

Global instructions loaded on every opencode session start.

## Shell / process management on Windows

- **`cmd /c "start /B <command>"` BLOCKS the tool call** even though `start /B` is supposed to background the process. The shell waits for the backgrounded process to finish before returning control. This causes the agent to look "stuck" for tens of seconds.
- **Use PowerShell `Start-Process` instead** — it returns immediately, the process runs detached, no blocking:
  ```powershell
  Start-Process -FilePath "C:\path\to\python.exe" `
    -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" `
    -WorkingDirectory "C:\path\to\project" `
    -WindowStyle Hidden
  ```
- **Verify the process started** with `Get-Process -Id <pid>` and `curl.exe http://127.0.0.1:PORT/health` before assuming it's up.
- **PowerShell aliases `curl` to `Invoke-WebRequest`**, which has a different argument syntax. Always call `curl.exe` explicitly.
- For long-running dev servers (uvicorn, expo start, vite), never use the bash tool with `start /B`. Start once, verify, move on.

## npm / npx install quirks on Windows + Expo

- `npx expo install <pkg>` reports success but does NOT actually save to `package.json` on this machine. The package is added to `node_modules` but `npm ls <pkg>` shows `(empty)`.
- **Workaround:** use plain `npm install <pkg>` (or `npm install <pkg>@<version>`) instead. Verify with `npm ls <pkg>` afterwards.
- Always re-run `npx tsc --noEmit` after installing — missing types are the symptom of this bug.

## React Native NativeWind `className` + Pressable

- The combination of NativeWind `className` prop on a `Pressable` element, particularly when it is a descendant of a component that uses `useSyncExternalStore` or other stores that emit synchronous updates during render, can trigger a false "Couldn't find a navigation context" error from React Navigation at runtime — even though no code path actually uses navigation hooks.
- Workaround: convert `className` to inline `StyleSheet.create()` for the offending component subtree. This is a workaround, not an explanation. Real root cause is still unknown.
- `items-baseline` in NativeWind maps to `alignItems: 'baseline'` which IS supported in React Native, but NativeWind v4.2.5 may not properly translate it. Use `style={{ alignItems: 'baseline' }}` inline instead.
- Whitespace text nodes between JSX elements inside a `<View>` (e.g. `</Text>\n{suffix && <Text>...}`) can crash React Native as "Unexpected text node". Put conditional Text elements on the same line as their parent, or use ternary expressions.

## wger API quirks (Python seed)

- The `/api/v2/exercise/` endpoint returns exercises WITHOUT English names — the names live in `/api/v2/exercise-translation/?language=2` keyed by translation id, with the exercise's own wger id in the `exercise` field.
- Two-step paged fetch is required: page through `/exercise/` to get all records (muscles, equipment), separately page through `/exercise-translation/?language=2` to build a name index, then join by id.
- wger's pagination occasionally yields duplicate rows across page boundaries. Always dedupe by wger's own `id` field, not array index.
- Use the `uuid` field or the integer `id` from the `/exercise/` endpoint as the stable source-of-truth key, never the array index.
- Cache the raw response to a `fixtures/wger_cache.json` file so subsequent runs work offline.
- Save cache only when fetch succeeded (so `wger_cache.json` is only created when it can be populated). If both fetch and cache load fail, fall back to hand-curated seed data.

## SQLite + SQLModel

- For tests, override `DATABASE_URL` env var BEFORE importing the app modules. The `lru_cache`d `get_settings()` will read the env at first call. In conftest, call `config_module.get_settings.cache_clear()` to force re-read.
- For tests, also swap `db_module.engine` to the test engine. The conftest's `engine` fixture must return the engine BEFORE `create_app()` is called.
- Date filtering on strings (e.g. `WHERE date >= '2026-06-01'`) works correctly with ISO `YYYY-MM-DD` format. `Query(pattern=r"^\d{4}-\d{2}-\d{2}$")` validates input format.

## React Query + optimistic updates

- `onMutate`'s optimistic update MUST target the SAME query key as the hook that reads the data. If multiple filtered query keys exist (e.g. one for `["me", "history", today, today]` and another for `["me", "history", null, null]`), iterate over `qc.getQueriesData({ queryKey: ["me", "history"] })` and patch each one. Rollback the same way.
- Optimistic placeholder IDs should be negative (e.g. `-Date.now()`) so the server's real positive id can replace them on success. Guard delete/mutate handlers on those rows with `if (id < 0) return` until the server response settles.

## TypeScript strict mode + React Query

- React Query's `UseMutationResult` generic propagates the mutation variables and context types. When `onMutate` returns a context, the `onError` and `onSettled` callbacks see it as `unknown` unless you type the function explicitly. Either type the function or use `ctx?.` everywhere with a runtime guard.
- `qc.getQueriesData<T>({ queryKey: ... })` returns `[QueryKey, T | undefined][]`. Use the actual key value (a `readonly unknown[]`) as the Map key for snapshot/rollback storage.
