import { View, Text, Pressable, Linking } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { colors, radius, space, type } from '@/lib/theme';

const youtubeUrl = (id: string) => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;

/**
 * YouTube video IDs are 11 chars (base64-ish: A-Z, a-z, 0-9, _, -).
 * Guard against malformed values before building the URL.
 */
const YT_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
function isValidYtId(id: string): boolean {
  return YT_ID_RE.test(id);
}

interface Props {
  ytId: string;
  exerciseName: string;
  onClose: () => void;
}

export function DemoVideoSheet({ ytId, exerciseName, onClose }: Props) {
  const valid = isValidYtId(ytId);
  return (
    <Sheet visible onClose={onClose} title={exerciseName}>
      <View
        style={{
          aspectRatio: 16 / 9,
          backgroundColor: '#000',
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.xxl,
          gap: space.lg,
        }}
      >
        {valid ? (
          <>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ ...type.body, color: '#ffffff', textAlign: 'center' }}
            >
              Demo video: {exerciseName}
            </Text>
            <Pressable
              onPress={() => Linking.openURL(youtubeUrl(ytId))}
              // Static style (not the `({ pressed }) => …` form) — NativeWind v4
              // drops function-form styles on its wrapped Pressable. See Button.tsx.
              style={{
                paddingHorizontal: space.xxl,
                paddingVertical: space.md,
                borderRadius: radius.sm,
                backgroundColor: colors.primary,
              }}
            >
              <Text maxFontSizeMultiplier={1.3} style={{ ...type.label, fontWeight: '600', color: colors.primaryForeground }}>
                Watch on YouTube
              </Text>
            </Pressable>
          </>
        ) : (
          <Text maxFontSizeMultiplier={1.3} style={{ ...type.body, color: '#ffffff', textAlign: 'center' }}>
            No demo video available
          </Text>
        )}
      </View>
    </Sheet>
  );
}
