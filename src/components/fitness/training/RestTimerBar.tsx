import { useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Pause, Play, RotateCcw } from 'lucide-react-native';
import { colors, elevation, radius, space, tabular } from '@/lib/theme';

interface Props {
  remainingSec: number;
  durationSec: number;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onRestart: () => void;
  onAddTime: (deltaSec: number) => void;
  onSetDuration: (sec: number) => void;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Visual hit area for the round/pill controls is intentionally smaller than
// 44pt — `hitSlop` pads the *touchable* area back up to (or past) 44pt
// without the button itself eating layout space.
const HIT_SLOP = { top: 12, bottom: 12, left: 10, right: 10 };

const GHOST_SIZE = 32;
const PLAY_SIZE = 44;
const PROGRESS_TRACK_H = 3;
const BAR_MIN_HEIGHT = 56;

/**
 * Always-rendered, manual-only rest timer bar. Never starts itself — the
 * play button is the only thing that calls `onStart`. Duration edits
 * (±15, or the inline editor) are session-local; they flow up to
 * `useRestTimer`'s `durationSec`/`setDuration` and are never written back
 * to preferences.
 *
 * DESIGN.md §3.3 — "one number and four verbs, one grammar": the clock is
 * the sole hero (no eyebrow label, no chip fill, no pencil icon — a dotted
 * underline alone carries "tap to edit"), the three secondary actions
 * (−15/+15/restart) are one cluster of identical 32dp ghost circles, and
 * play/pause is the bar's only coral element. The bar never changes border
 * width between idle/running (that used to shift layout by 0.5dp every time
 * the timer started) — running state only recolors the clock text, plus the
 * progress track filling along the bottom edge.
 *
 * Every control OTHER than the text input itself (play/pause, ±15,
 * restart) routes through `commitAndRun`: commit whatever is currently
 * typed (so a fresh edit takes effect), force the keyboard away, THEN run
 * the actual action — synchronously, in one press. This is what fixes the
 * "timer starts running while the duration input is still focused, cursor
 * blinking, keyboard up" bug: pressing play right after typing `50` now
 * commits 50 to `durationSec` before `onStart` reads it, because both
 * flow through the same synchronous handler.
 */
export function RestTimerBar({
  remainingSec,
  durationSec,
  isRunning,
  onStart,
  onPause,
  onRestart,
  onAddTime,
  onSetDuration,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const progress = durationSec > 0 ? Math.max(0, Math.min(1, 1 - remainingSec / durationSec)) : 0;

  const beginEdit = () => {
    setDraft(String(durationSec));
    setEditing(true);
  };

  // Applies the typed value (if any) and leaves edit mode. No-op when not
  // editing. Does NOT blur/dismiss the keyboard itself — callers that need
  // that do it via `commitAndRun` below, so ordering relative to `action()`
  // is explicit and synchronous rather than relying on a native blur event.
  const commitDraft = () => {
    if (!editing) return;
    // Raw seconds input (not m:ss) — a bare number-pad entry, no ":" to
    // parse or mistype.
    const parsed = Number(draft);
    if (draft !== '' && Number.isFinite(parsed) && parsed >= 0) {
      onSetDuration(parsed);
    }
    setEditing(false);
    setDraft('');
  };

  const commitAndRun = (action: () => void) => {
    commitDraft();
    inputRef.current?.blur();
    Keyboard.dismiss();
    action();
  };

  const handlePlayPress = () => commitAndRun(isRunning ? onPause : onStart);
  const handleMinus15 = () => commitAndRun(() => onAddTime(-15));
  const handlePlus15 = () => commitAndRun(() => onAddTime(15));
  const handleRestartPress = () => commitAndRun(onRestart);

  const clockColor = isRunning ? colors.primary : colors.foreground;

  return (
    <View
      className="overflow-hidden"
      style={{
        minHeight: BAR_MIN_HEIGHT,
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: 0,
        ...elevation.e1,
      }}
    >
      <View
        className="flex-row items-center justify-between flex-1"
        style={{ paddingHorizontal: space.lg, gap: space.md, minHeight: BAR_MIN_HEIGHT - PROGRESS_TRACK_H }}
      >
        {/* Hero: the clock. Only this element flexes. */}
        {editing ? (
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            accessibilityLabel="Rest timer duration in seconds"
            maxFontSizeMultiplier={1.3}
            style={{
              flex: 1,
              fontSize: 22,
              fontWeight: '700',
              letterSpacing: -0.3,
              color: colors.foreground,
              minHeight: 44,
              borderBottomWidth: 1.5,
              borderColor: colors.ring,
              paddingVertical: 0,
              ...tabular,
            }}
          />
        ) : (
          <Pressable
            onPress={beginEdit}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Rest timer duration, ${fmtClock(remainingSec)}. Tap to edit.`}
            style={{ flex: 1, alignItems: 'flex-start' }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{
                fontSize: 22,
                fontWeight: '700',
                letterSpacing: -0.3,
                color: clockColor,
                borderBottomWidth: 1,
                borderStyle: 'dotted',
                borderColor: colors.mutedForeground,
                paddingBottom: 1,
                ...tabular,
              }}
            >
              {fmtClock(remainingSec)}
            </Text>
          </Pressable>
        )}

        {/* One cluster: three identical 32dp ghost circles, then the one
            coral emphasis (play/pause). */}
        <View className="flex-row items-center" style={{ gap: space.sm, flexShrink: 0 }}>
          <Pressable
            onPress={handleMinus15}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Subtract 15 seconds"
            className="items-center justify-center"
            style={{ width: GHOST_SIZE, height: GHOST_SIZE, borderRadius: radius.full, backgroundColor: colors.muted }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13, fontWeight: '500', color: colors.foreground, ...tabular }}
            >
              −15
            </Text>
          </Pressable>
          <Pressable
            onPress={handlePlus15}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Add 15 seconds"
            className="items-center justify-center"
            style={{ width: GHOST_SIZE, height: GHOST_SIZE, borderRadius: radius.full, backgroundColor: colors.muted }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13, fontWeight: '500', color: colors.foreground, ...tabular }}
            >
              +15
            </Text>
          </Pressable>
          <Pressable
            onPress={handleRestartPress}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Restart rest timer"
            className="items-center justify-center"
            style={{ width: GHOST_SIZE, height: GHOST_SIZE, borderRadius: radius.full, backgroundColor: colors.muted }}
          >
            <RotateCcw size={15} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={handlePlayPress}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={isRunning ? 'Pause rest timer' : 'Start rest timer'}
            className="items-center justify-center"
            style={{ width: PLAY_SIZE, height: PLAY_SIZE, borderRadius: radius.full, backgroundColor: colors.primary }}
          >
            {isRunning ? (
              <Pause size={18} color={colors.primaryForeground} />
            ) : (
              <Play size={18} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Progress track — the only continuously animating element on the
          bar (DESIGN.md §2.7). Pinned to the bottom edge, not a full-bar
          wash. */}
      <View
        className="absolute left-0 bottom-0"
        style={{ width: `${progress * 100}%`, height: PROGRESS_TRACK_H, backgroundColor: colors.primary }}
      />
    </View>
  );
}
