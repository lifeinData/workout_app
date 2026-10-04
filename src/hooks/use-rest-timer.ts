import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DURATION_SEC = 3600;

export interface RestTimerState {
  remainingSec: number;
  durationSec: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  restart: () => void;
  stop: () => void;
  addTime: (deltaSec: number) => void;
  setDuration: (sec: number) => void;
}

/**
 * Foreground-only, MANUAL-ONLY rest-timer countdown. Deliberately does NOT
 * use `expo-notifications` — that would force a dev-client build (it no
 * longer works in Expo Go) for a feature that's easy to defer. If a
 * lock-screen alert is ever added, it slots in next to the
 * `Haptics.notificationAsync` call below without touching the rest of
 * this hook's shape.
 *
 * Anchored on a `Date.now()` deadline rather than decrementing a
 * counter every tick — a plain `setInterval` counter drifts badly
 * whenever the JS timer is throttled (e.g. the app briefly
 * backgrounded), while re-deriving `remaining = deadline - now` every
 * tick is always correct regardless of how many ticks were missed.
 *
 * `durationSec` is session-local only — it is never persisted back to
 * preferences. It is seeded once from `initialSec` and can be edited
 * freely (±15 buttons, inline editor) while idle or while running.
 */
export function useRestTimer(initialSec: number): RestTimerState {
  const [durationSec, setDurationSec] = useState(initialSec);
  const [remainingSec, setRemainingSec] = useState(initialSec);
  const [isRunning, setIsRunning] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  // Keep-awake is active ONLY while the timer is actually running — never
  // for the whole session. useKeepAwake() cannot be called conditionally
  // (hook rules), so drive the imperative API from an effect instead.
  useEffect(() => {
    if (!isRunning) return;
    activateKeepAwakeAsync().catch(() => {
      /* keep-awake unavailable on this device — non-fatal */
    });
    return () => {
      deactivateKeepAwake().catch(() => {
        /* non-fatal */
      });
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(remaining);
      if (remaining === 0 && !firedRef.current) {
        firedRef.current = true;
        setIsRunning(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
          /* haptics unavailable on this device — non-fatal */
        });
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isRunning]);

  const start = useCallback(() => {
    setDurationSec((d) => {
      firedRef.current = false;
      deadlineRef.current = Date.now() + d * 1000;
      setRemainingSec(d);
      setIsRunning(true);
      return d;
    });
  }, []);

  const pause = useCallback(() => {
    // Freezes the displayed remainingSec and stops the countdown.
    // Per spec, pressing play again calls `start()`, which begins fresh
    // from `durationSec` rather than resuming from where this paused —
    // there is no separate "resume" concept in this API.
    deadlineRef.current = null;
    setIsRunning(false);
  }, []);

  const restart = useCallback(() => {
    setDurationSec((d) => {
      firedRef.current = false;
      deadlineRef.current = Date.now() + d * 1000;
      setRemainingSec(d);
      setIsRunning(true);
      return d;
    });
  }, []);

  const stop = useCallback(() => {
    deadlineRef.current = null;
    setIsRunning(false);
  }, []);

  const addTime = useCallback((deltaSec: number) => {
    if (deadlineRef.current === null) {
      // Idle (or paused): adjust the configured duration, clamped.
      setDurationSec((d) => {
        const next = Math.max(0, Math.min(MAX_DURATION_SEC, d + deltaSec));
        setRemainingSec(next);
        return next;
      });
      return;
    }
    // Running: extend the live deadline.
    deadlineRef.current += deltaSec * 1000;
    setRemainingSec((r) => Math.max(0, r + deltaSec));
    setDurationSec((d) => Math.max(0, Math.min(MAX_DURATION_SEC, d + deltaSec)));
  }, []);

  const setDuration = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(MAX_DURATION_SEC, Math.round(sec)));
    setDurationSec(clamped);
    if (deadlineRef.current === null) {
      setRemainingSec(clamped);
    } else {
      // Editing while running re-anchors the deadline to the new duration
      // rather than leaving remaining/duration inconsistent.
      deadlineRef.current = Date.now() + clamped * 1000;
      setRemainingSec(clamped);
    }
  }, []);

  return {
    remainingSec,
    durationSec,
    isRunning,
    start,
    pause,
    restart,
    stop,
    addTime,
    setDuration,
  };
}
