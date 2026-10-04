import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { ArrowUp, X } from 'lucide-react-native';
import Toast from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CoachAvatar } from '@/components/fitness/coach/CoachAvatar';
import { colors, elevation, radius, space, tabular, type } from '@/lib/theme';
import { fmtTimeLocal, localDateKey, localDateKeyDaysAgo, todayKeyLocal } from '@/lib/dates';
import { useMarkRead, useMessages, useSendMessage } from '@/lib/queries';
import type { MessageResponse } from '@/lib/api';

export interface MessageThreadSheetProps {
  visible: boolean;
  onClose: () => void;
  otherUser: { id: string; display_name: string | null; username: string; initials: string | null };
  /** Shown under the name, e.g. "Your coach", "Request pending", "Athlete". */
  subtitle?: string;
}

/** Matches the server's body limit (`POST /me/messages/{id}`, 1..2000). */
const MAX_BODY = 2000;
/** Show the remaining-characters counter only near the limit. */
const COUNTER_FROM = MAX_BODY - 200;
/** Consecutive messages from one sender within this window read as one cluster. */
const CLUSTER_WINDOW_MS = 5 * 60 * 1000;
const COMPOSER_MAX_HEIGHT = 120;

/* ------------------------------------------------------------------ *
 * Pure helpers                                                        *
 * ------------------------------------------------------------------ */

function dayKey(iso: string): string {
  return localDateKey(new Date(iso));
}

function dayLabel(iso: string): string {
  const key = dayKey(iso);
  if (key === todayKeyLocal()) return 'Today';
  if (key === localDateKeyDaysAgo(1)) return 'Yesterday';
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** True when `a` and `b` are the same sender, same day and close in time. */
function sameCluster(a: MessageResponse | undefined, b: MessageResponse | undefined): boolean {
  if (!a || !b) return false;
  if (a.sender_id !== b.sender_id) return false;
  if (dayKey(a.created_at) !== dayKey(b.created_at)) return false;
  return Math.abs(Date.parse(a.created_at) - Date.parse(b.created_at)) <= CLUSTER_WINDOW_MS;
}

/* ------------------------------------------------------------------ *
 * Bubble                                                              *
 * ------------------------------------------------------------------ */

interface BubbleProps {
  message: MessageResponse;
  mine: boolean;
  /** Joined to the chronologically previous (older) bubble. */
  joinPrev: boolean;
  /** Joined to the chronologically next (newer) bubble. */
  joinNext: boolean;
  /** First message of its local day — renders the day divider above it. */
  showDay: boolean;
}

function Bubble({ message, mine, joinPrev, joinNext, showDay }: BubbleProps) {
  const pending = message.id < 0;
  // The joined edge tightens to r.sm so a cluster reads as one utterance;
  // the outer corners keep r.lg. The sender-side bottom corner is always the
  // tighter "tail" so direction is legible even on a single bubble.
  const corners = mine
    ? {
        borderTopLeftRadius: radius.lg,
        borderBottomLeftRadius: radius.lg,
        borderTopRightRadius: joinPrev ? radius.sm : radius.lg,
        borderBottomRightRadius: radius.sm,
      }
    : {
        borderTopRightRadius: radius.lg,
        borderBottomRightRadius: radius.lg,
        borderTopLeftRadius: joinPrev ? radius.sm : radius.lg,
        borderBottomLeftRadius: radius.sm,
      };

  return (
    <View style={{ marginTop: joinPrev ? space.xs : space.md }}>
      {showDay ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            ...type.caption,
            color: colors.mutedForeground,
            textAlign: 'center',
            marginTop: space.md,
            marginBottom: space.sm,
          }}
        >
          {dayLabel(message.created_at)}
        </Text>
      ) : null}

      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '80%',
            paddingHorizontal: space.lg,
            paddingVertical: 10,
            backgroundColor: mine ? colors.primary : colors.secondary,
            opacity: pending ? 0.7 : 1,
            ...corners,
          }}
        >
          <Text
            selectable
            maxFontSizeMultiplier={1.3}
            style={{
              ...type.body,
              lineHeight: 21,
              color: mine ? colors.primaryForeground : colors.secondaryForeground,
            }}
          >
            {message.body}
          </Text>
        </View>

        {!joinNext ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={{
              ...type.caption,
              ...tabular,
              color: colors.mutedForeground,
              marginTop: space.xs,
              marginHorizontal: space.xs,
            }}
          >
            {pending ? 'Sending…' : fmtTimeLocal(message.created_at)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Android keyboard fallback                                           *
 * ------------------------------------------------------------------ */

/**
 * `softwareKeyboardLayoutMode: resize` handles the main window, and RN asks
 * the Modal's dialog window to resize too, but edge-to-edge Android can skip
 * that. After the keyboard settles we measure how far the composer still
 * overlaps it and pad by exactly that much — 0 when the window already
 * resized, so it never double-adjusts. iOS uses KeyboardAvoidingView instead.
 */
function useAndroidKeyboardOverlap(enabled: boolean) {
  const composerRef = useRef<View>(null);
  const padRef = useRef(0);
  const [pad, setPad] = useState(0);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      requestAnimationFrame(() => {
        composerRef.current?.measureInWindow((_x, y, _w, h) => {
          const unpaddedBottom = y + h + padRef.current;
          const next = Math.max(0, Math.round(unpaddedBottom - keyboardTop));
          padRef.current = next;
          setPad(next);
        });
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      padRef.current = 0;
      setPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);

  return { composerRef, keyboardPad: Platform.OS === 'android' ? pad : 0 };
}

/* ------------------------------------------------------------------ *
 * Sheet                                                               *
 * ------------------------------------------------------------------ */

/**
 * Full-height DM thread (D12). Built on RN `Modal` rather than the shared
 * `Sheet` because a chat needs a flex column (header · inverted list ·
 * composer) that the Sheet's padded content box can't give, plus keyboard
 * avoidance around the composer. The visual shell matches DESIGN.md §3.6
 * exactly: dimmed `rgba(61,43,38,0.5)` backdrop, r.xl top corners, e2,
 * 36×4 grabber, 32dp muted close button.
 */
export function MessageThreadSheet({ visible, onClose, otherUser, subtitle }: MessageThreadSheetProps) {
  const name = otherUser.display_name?.trim() || otherUser.username;
  const otherId = otherUser.id;

  const messagesQuery = useMessages(otherId, { enabled: visible });
  const sendMessage = useSendMessage();
  const { mutate: markRead } = useMarkRead();

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const { composerRef, keyboardPad } = useAndroidKeyboardOverlap(visible);

  const messages = messagesQuery.data;
  // Inverted list: newest first, so the thread is anchored to the composer.
  const newestFirst = useMemo(() => (messages ? [...messages].reverse() : []), [messages]);

  // Any id that isn't the other person's is mine — the thread has exactly two
  // participants, and B1's optimistic rows (negative id) are always mine.
  const isMine = useCallback((m: MessageResponse) => m.sender_id !== otherId, [otherId]);

  /* -- mark read: once on open, then whenever a new unread message arrives -- */
  const latestUnreadIncomingId = useMemo(() => {
    let latest: number | null = null;
    for (const m of messages ?? []) {
      if (m.sender_id === otherId && m.read_at === null && (latest === null || m.id > latest)) {
        latest = m.id;
      }
    }
    return latest;
  }, [messages, otherId]);

  const lastMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) {
      lastMarkedRef.current = null;
      return;
    }
    const key = `${otherId}:${latestUnreadIncomingId ?? 'open'}`;
    if (lastMarkedRef.current === key) return;
    // Already marked on this open and nothing new is unread → nothing to do.
    if (latestUnreadIncomingId === null && lastMarkedRef.current?.startsWith(`${otherId}:`)) return;
    lastMarkedRef.current = key;
    markRead(otherId);
  }, [visible, otherId, latestUnreadIncomingId, markRead]);

  /* -- send -- */
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !sendMessage.isPending;

  const handleSend = () => {
    if (!canSend) return;
    const body = trimmed.slice(0, MAX_BODY);
    setDraft('');
    sendMessage.mutate(
      { otherId, body },
      {
        onError: (err) => {
          // The optimistic bubble rolls back in the hook — hand the text back
          // so nothing the user typed is lost.
          setDraft((current) => (current.length > 0 ? current : body));
          Toast.show({ type: 'error', text1: 'Message not sent', text2: err.message });
        },
      }
    );
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<MessageResponse>) => {
    const older = newestFirst[index + 1];
    const newer = index > 0 ? newestFirst[index - 1] : undefined;
    return (
      <Bubble
        message={item}
        mine={isMine(item)}
        joinPrev={sameCluster(item, older)}
        joinNext={sameCluster(item, newer)}
        showDay={!older || dayKey(older.created_at) !== dayKey(item.created_at)}
      />
    );
  };

  const remaining = MAX_BODY - draft.length;

  /* -- body states -- */
  let body: ReactNode;
  if (messagesQuery.isLoading) {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  } else if (messagesQuery.isError && !messages) {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl }}>
        <Text maxFontSizeMultiplier={1.3} style={{ ...type.body, color: colors.foreground, textAlign: 'center' }}>
          Couldn&apos;t load messages.
        </Text>
        <Button label="Try again" variant="ghost" size="sm" onPress={() => void messagesQuery.refetch()} />
      </View>
    );
  } else if (newestFirst.length === 0) {
    // Rendered outside the FlatList: an inverted list flips its empty component.
    body = (
      <Pressable
        onPress={Keyboard.dismiss}
        accessible={false}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl }}
      >
        <CoachAvatar initials={otherUser.initials} name={name} size={56} />
        <Text maxFontSizeMultiplier={1.3} style={{ ...type.heading, color: colors.foreground, textAlign: 'center' }}>
          No messages yet
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ ...type.label, color: colors.mutedForeground, textAlign: 'center' }}
        >
          Start the conversation.
        </Text>
      </Pressable>
    );
  } else {
    body = (
      <FlatList
        data={newestFirst}
        inverted
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(61,43,38,0.5)',
            }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />

          <View
            style={{
              height: '92%',
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              overflow: 'hidden',
              paddingBottom: keyboardPad,
              ...elevation.e2,
            }}
          >
            {/* Grabber */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: radius.full,
                backgroundColor: colors.border,
                alignSelf: 'center',
                marginTop: space.sm,
              }}
            />

            {/* Header: who you're talking to */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.xl,
                paddingTop: space.md,
                paddingBottom: space.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <CoachAvatar initials={otherUser.initials} name={name} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                  accessibilityRole="header"
                  style={{ ...type.heading, color: colors.foreground }}
                >
                  {name}
                </Text>
                {subtitle ? (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    style={{ ...type.caption, color: colors.mutedForeground }}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton onPress={onClose} accessibilityLabel="Close conversation">
                <X size={16} color={colors.mutedForeground} />
              </IconButton>
            </View>

            {/* Thread */}
            <View style={{ flex: 1, backgroundColor: colors.card }}>{body}</View>

            {/* Composer */}
            <View
              ref={composerRef}
              collapsable={false}
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingHorizontal: space.lg,
                paddingTop: space.md,
                paddingBottom: space.md,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder={`Message ${name}`}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={MAX_BODY}
                  maxFontSizeMultiplier={1.3}
                  textAlignVertical="center"
                  accessibilityLabel={`Message ${name}`}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    maxHeight: COMPOSER_MAX_HEIGHT,
                    paddingHorizontal: space.lg,
                    paddingTop: space.md - 1.5,
                    paddingBottom: space.md - 1.5,
                    borderRadius: radius.lg,
                    borderWidth: 1.5,
                    borderColor: focused ? colors.ring : 'transparent',
                    backgroundColor: colors.inputBackground,
                    color: colors.foreground,
                    ...type.body,
                    lineHeight: 20,
                  }}
                />
                <IconButton
                  size={44}
                  onPress={handleSend}
                  disabled={!canSend}
                  backgroundColor={canSend ? colors.primary : colors.muted}
                  accessibilityLabel="Send message"
                >
                  {sendMessage.isPending ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <ArrowUp
                      size={20}
                      strokeWidth={2.5}
                      color={canSend ? colors.primaryForeground : colors.mutedForeground}
                    />
                  )}
                </IconButton>
              </View>
              {draft.length >= COUNTER_FROM ? (
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{
                    ...type.caption,
                    ...tabular,
                    color: remaining <= 0 ? colors.destructive : colors.mutedForeground,
                    marginTop: space.xs,
                    marginLeft: space.lg,
                  }}
                >
                  {remaining} characters left
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
