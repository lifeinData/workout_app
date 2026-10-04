import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Check, Info, Trophy } from 'lucide-react-native';
import { colors, radius, space, tabular, type } from '@/lib/theme';

/**
 * In-app banner that replaces `react-native-toast-message`.
 *
 * Why our own: that library animates with `useNativeDriver: false` on
 * Android, so its slide ran on the JS thread — exactly when logging a set
 * floods the JS thread with cache updates + re-renders, so it stuttered.
 * Everything here (entry, exit, swipe) is a Reanimated worklet on the UI
 * thread; the JS thread only decides WHAT to show.
 *
 * API mirrors the old library so call sites only change their import:
 *   Toast.show({ type: 'success' | 'pr' | 'error' | 'info', text1, text2? })
 */

export type ToastType = 'success' | 'pr' | 'error' | 'info';

export interface ToastOptions {
  type?: ToastType;
  text1: string;
  text2?: string;
  /** Auto-hide delay in ms. Defaults: errors 4000, everything else 2600. */
  visibilityTime?: number;
}

interface ShownToast extends Required<Pick<ToastOptions, 'type' | 'text1'>> {
  text2?: string;
  visibilityTime: number;
  /** Bumped on every show so a repeat of identical text still re-arms the timer. */
  key: number;
}

type Listener = (t: ShownToast | null) => void;
let listener: Listener | null = null;
let nextKey = 1;
// Module-level (not a ref): there is exactly one ToastHost, and a ref read
// inside gesture callbacks trips the React Compiler lint rules.
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const clearHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
};

const Toast = {
  show(opts: ToastOptions) {
    const t: ShownToast = {
      type: opts.type ?? 'success',
      text1: opts.text1,
      text2: opts.text2,
      visibilityTime: opts.visibilityTime ?? (opts.type === 'error' ? 4000 : 2600),
      key: nextKey++,
    };
    listener?.(t);
  },
  hide() {
    listener?.(null);
  },
};

export default Toast;

// DESIGN.md §2.7 — 220ms entry; exit a touch quicker. Exponential ease-out,
// no spring (the old library's spring was part of the "wobbly" feel).
const ENTER_MS = 220;
const EXIT_MS = 180;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
/** Off-screen start, before the real height is measured. */
const FALLBACK_HEIGHT = 96;
const DISMISS_DRAG = -24;
const DISMISS_VELOCITY = -500;

// Literal RGBA tints (theme vars are hex, so `/NN` modifiers render
// invisible — CLAUDE.md gotcha #2).
const VARIANT = {
  success: {
    badgeBg: 'rgba(155, 184, 138, 0.24)', // --success
    icon: (c: string) => <Check size={16} color={c} strokeWidth={3} />,
    iconColor: colors.foreground,
    surface: colors.card,
    title: colors.foreground,
    body: colors.mutedForeground,
  },
  // DESIGN.md §2.2 — a personal record is one of coral's three permitted roles.
  pr: {
    badgeBg: colors.primary,
    icon: (c: string) => <Trophy size={16} color={c} strokeWidth={2.5} />,
    iconColor: colors.primaryForeground,
    surface: colors.secondary,
    title: colors.secondaryForeground,
    body: colors.secondaryForeground,
  },
  error: {
    badgeBg: 'rgba(217, 106, 90, 0.16)', // --destructive
    icon: (c: string) => <AlertCircle size={16} color={c} strokeWidth={2.5} />,
    iconColor: colors.destructive,
    surface: colors.card,
    title: colors.foreground,
    body: colors.mutedForeground,
  },
  info: {
    badgeBg: colors.muted,
    icon: (c: string) => <Info size={16} color={c} strokeWidth={2.5} />,
    iconColor: colors.mutedForeground,
    surface: colors.card,
    title: colors.foreground,
    body: colors.mutedForeground,
  },
} as const;

/** Mount once at the app root, after the navigator, inside a GestureHandlerRootView. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [toast, setToast] = useState<ShownToast | null>(null);

  // 0 = hidden above the screen, 1 = resting. `drag` is the live swipe offset.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(FALLBACK_HEIGHT);

  const clear = useCallback(() => setToast(null), []);

  const animateOut = useCallback(() => {
    clearHideTimer();
    progress.set(
      withTiming(0, { duration: EXIT_MS, easing: EASE_IN }, (finished) => {
        if (finished) scheduleOnRN(clear);
      })
    );
  }, [progress, clear]);

  useEffect(() => {
    listener = (t) => {
      if (!t) {
        animateOut();
        return;
      }
      setToast(t);
    };
    return () => {
      listener = null;
    };
  }, [animateOut]);

  // A new toast while one is already up swaps content in place (no
  // re-slide) — logging sets back-to-back stays calm instead of bouncing.
  useEffect(() => {
    if (!toast) return;
    drag.set(0);
    progress.set(withTiming(1, { duration: ENTER_MS, easing: EASE_OUT }));
    if (toast.type === 'pr') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (toast.type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    AccessibilityInfo.announceForAccessibility(
      toast.text2 ? `${toast.text1}. ${toast.text2}` : toast.text1
    );
    clearHideTimer();
    hideTimer = setTimeout(animateOut, toast.visibilityTime);
  }, [toast, progress, drag, animateOut]);

  useEffect(() => clearHideTimer, []);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Free upward; heavy resistance downward so it can't be pulled off its rest.
      drag.set(e.translationY < 0 ? e.translationY : e.translationY * 0.15);
    })
    .onEnd((e) => {
      if (e.translationY < DISMISS_DRAG || e.velocityY < DISMISS_VELOCITY) {
        scheduleOnRN(animateOut);
      } else {
        drag.set(withTiming(0, { duration: EXIT_MS, easing: EASE_OUT }));
      }
    });
  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(animateOut);
  });
  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const offscreen = -(height.get() + insets.top + space.lg);
    const travel = reduceMotion ? 0 : offscreen * (1 - p);
    return {
      opacity: reduceMotion ? p : Math.min(1, p * 1.6),
      transform: [{ translateY: travel + drag.get() }],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    height.set(e.nativeEvent.layout.height);
  };

  if (!toast) return null;
  const v = VARIANT[toast.type];

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.sm }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          onLayout={onLayout}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityHint="Swipe up or tap to dismiss"
          style={[styles.toast, { backgroundColor: v.surface }, animatedStyle]}
        >
          <View style={[styles.badge, { backgroundColor: v.badgeBg }]}>{v.icon(v.iconColor)}</View>
          <View style={styles.text}>
            <Text
              style={[type.body, { color: v.title }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {toast.text1}
            </Text>
            {toast.text2 ? (
              <Text
                style={[type.caption, tabular, { color: v.body }]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
              >
                {toast.text2}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.lg,
    borderRadius: radius.lg,
    // Floating ABOVE content, so the warm e2 shadow falls downward.
    shadowColor: colors.foreground,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
