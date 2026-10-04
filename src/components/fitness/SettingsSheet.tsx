import { View, Text } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { usePatchPreferences, usePreferences, useLogout } from '@/lib/queries';
import type { WeightUnit } from '@/lib/units';
import { Sheet } from '@/components/ui/Sheet';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/lib/theme';

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
    <Sheet visible onClose={onClose} title="Settings">
      <View style={{ gap: space.xxl }}>
        <View style={{ gap: space.sm }}>
          <Text maxFontSizeMultiplier={1.3} style={{ ...type.micro, color: colors.mutedForeground }}>
            Weight unit
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {(['lb', 'kg'] as const).map((u) => (
              <Chip
                key={u}
                label={u.toUpperCase()}
                active={weightUnit === u}
                onPress={() => patchPrefs.mutate({ weight_unit: u })}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text maxFontSizeMultiplier={1.3} style={{ ...type.micro, color: colors.mutedForeground }}>
            Default rest
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {REST_OPTIONS.map((sec) => (
              <Chip
                key={sec}
                label={`${sec}s`}
                active={restSec === sec}
                onPress={() => patchPrefs.mutate({ default_rest_sec: sec })}
              />
            ))}
          </View>
        </View>

        <Button
          label={logout.isPending ? 'Signing out…' : 'Sign out'}
          onPress={() => logout.mutate()}
          disabled={logout.isPending}
          loading={logout.isPending}
          variant="ghost"
          leftIcon={<LogOut size={16} color={colors.mutedForeground} />}
        />
      </View>
    </Sheet>
  );
}
