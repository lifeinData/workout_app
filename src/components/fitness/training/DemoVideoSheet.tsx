import { View, Text, Pressable, Modal, Linking } from 'react-native';
import { X } from 'lucide-react-native';

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
    <Modal visible animationType="fade" transparent>
      <View className="flex-1 items-center justify-center p-4">
        <Pressable className="absolute inset-0 bg-foreground/60" onPress={onClose} />
        <View className="w-full bg-card rounded-3xl border border-border shadow-lg overflow-hidden">
          <View className="flex-row items-center justify-between p-4 border-b border-border">
            <View>
              <Text className="text-xs text-muted-foreground">Demo</Text>
              <Text className="text-base font-semibold text-card-foreground">{exerciseName}</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-muted items-center justify-center">
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>
          <View className="p-8 items-center" style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}>
            {valid ? (
              <>
                <Text className="text-white text-base mb-4 text-center">Demo video: {exerciseName}</Text>
                <Pressable
                  onPress={() => Linking.openURL(youtubeUrl(ytId))}
                  className="px-6 py-3 bg-primary rounded-xl"
                >
                  <Text className="text-primary-foreground font-semibold">Watch on YouTube</Text>
                </Pressable>
              </>
            ) : (
              <Text className="text-white text-base text-center">No demo video available</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
