import { View, Text, Pressable, Modal } from 'react-native';
import { LogOut, X } from 'lucide-react-native';
import { usePatchPreferences, usePreferences, useLogout } from '@/lib/queries';
import type { WeightUnit } from '@/lib/units';

const REST_OPTIONS = [60, 90, 120, 180];

interface Props {
  onClose: () => void;
}

export function SettingsSheet({ onClose }: Props) {
  const { data: prefs } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const logout = useLogout();

  const weightUnit = (prefs?.weight_unit ?? 'lb') as WeightUnit;
  const restSec = prefs?.default_rest_sec ?? 90;

  return (
    <Modal visible animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-foreground/40" onPress={onClose} />
        <View className="bg-card rounded-t-3xl border-t border-x border-border p-5 space-y-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-card-foreground tracking-tight">Settings</Text>
            <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
              <X size={18} color="#8b7268" />
            </Pressable>
          </View>

          <View className="space-y-2">
            <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">Weight unit</Text>
            <View className="flex-row gap-2">
              {(['lb', 'kg'] as const).map((u) => {
                const active = weightUnit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => patchPrefs.mutate({ weight_unit: u })}
                    className={`flex-1 py-3 rounded-xl items-center border ${
                      active ? 'bg-primary border-primary' : 'bg-muted border-border'
                    }`}
                  >
                    <Text className={active ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'}>
                      {u.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="space-y-2">
            <Text className="text-[10px] uppercase tracking-0.14em text-muted-foreground">Default rest</Text>
            <View className="flex-row gap-2">
              {REST_OPTIONS.map((sec) => {
                const active = restSec === sec;
                return (
                  <Pressable
                    key={sec}
                    onPress={() => patchPrefs.mutate({ default_rest_sec: sec })}
                    className={`flex-1 py-3 rounded-xl items-center border ${
                      active ? 'bg-primary border-primary' : 'bg-muted border-border'
                    }`}
                  >
                    <Text className={active ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'}>
                      {sec}s
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-muted"
          >
            <LogOut size={16} color="#8b7268" />
            <Text className="text-muted-foreground font-medium">
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
