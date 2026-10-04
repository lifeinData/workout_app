import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, elevation, radius, space, type } from '@/lib/theme';

interface SheetProps {
  /** Defaults to true — pass false to let the caller control mount/unmount instead. */
  visible?: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional fixed height as a percentage of the screen (e.g. 70). Undefined = content height. */
  heightPercent?: number;
}

const CLOSE_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/**
 * DESIGN.md §3.6 — the shared bottom-sheet primitive for every Training sheet
 * (SessionSummarySheet, SettingsSheet, DemoVideoSheet, ImportWorkoutSheet,
 * HistoryView's detail sheet). Backdrop, grabber, header slot, and card shell
 * are all fixed here so callers only supply content.
 */
export function Sheet({ visible = true, onClose, title, children, heightPercent }: SheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(61,43,38,0.5)' }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: space.xl,
            height: heightPercent ? `${heightPercent}%` : undefined,
            ...elevation.e2,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: radius.full,
              backgroundColor: colors.border,
              alignSelf: 'center',
              marginBottom: space.md,
            }}
          />

          {title !== undefined ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: space.lg,
              }}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ ...type.heading, color: colors.foreground, flexShrink: 1 }}
              >
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={CLOSE_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.full,
                  backgroundColor: colors.muted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}

          {children}
        </View>
      </View>
    </Modal>
  );
}
