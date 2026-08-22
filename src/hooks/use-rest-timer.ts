import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RestTimerState {
  remainingSec: number;
  targetSec: number;
  isRunning: boolean;
  start: (sec: number) => void;
  stop: () => void;
  addTime: (deltaSec: number) => void;
  skip: () => void;
}

/**
 * Foreground-only rest-timer countdown. Deliberately does NOT use
 * `expo-notifications` — that would force a dev-client build (it no
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
 */
export function useRestTimer(): RestTimerState {
  useKeepAwake();

  const [targetSec, setTargetSec] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);

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

  const start = useCallback((sec: number) => {
    firedRef.current = false;
    deadlineRef.current = Date.now() + sec * 1000;
    setTargetSec(sec);
    setRemainingSec(sec);
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    deadlineRef.current = null;
    setIsRunning(false);
    setRemainingSec(0);
  }, []);

  const addTime = useCallback((deltaSec: number) => {
    if (deadlineRef.current === null) return;
    deadlineRef.current += deltaSec * 1000;
    setRemainingSec((r) => Math.max(0, r + deltaSec));
    setTargetSec((t) => Math.max(0, t + deltaSec));
  }, []);

  const skip = useCallback(() => {
    stop();
  }, [stop]);

  return { remainingSec, targetSec, isRunning, start, stop, addTime, skip };
}
