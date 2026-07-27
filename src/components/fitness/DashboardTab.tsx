import { View, Text, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Flame, Droplets, Zap, Heart, TrendingUp, Footprints, Dumbbell, LogOut } from 'lucide-react-native';
import { useMe, useLogout } from '@/lib/queries';

interface DashboardTabProps {
  onOpenModal: () => void;
}

export function DashboardTab({ onOpenModal }: DashboardTabProps) {
  const { data: me } = useMe();
  const logout = useLogout();
  const macros = [
    { label: 'Protein',  value: 145,  target: 180,  unit: 'g', color: '#e87d6f', icon: Droplets },
    { label: 'Carbs',    value: 220,  target: 250,  unit: 'g', color: '#f0a868', icon: Zap },
    { label: 'Fats',     value: 55,   target: 65,   unit: 'g', color: '#c9a86f', icon: Heart },
    { label: 'Calories', value: 2100, target: 2400, unit: '',  color: '#9bb88a', icon: Flame },
  ];

  const displayName = me?.display_name ?? me?.username ?? 'there';
  const initials =
    me?.initials ??
    (me?.display_name
      ? me.display_name
          .split(/\s+/)
          .map((w) => w[0]?.toUpperCase() ?? '')
          .join('')
          .slice(0, 2)
      : me?.username.slice(0, 2).toUpperCase() ?? '?');

  return (
    <View className="p-5 space-y-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-foreground text-2xl font-bold">Hello, {displayName}</Text>
          <Text className="text-sm text-muted-foreground">Wednesday, June 3</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-10 h-10 rounded-full bg-muted items-center justify-center"
            accessibilityLabel="Sign out"
          >
            <LogOut size={18} color="#8b7268" />
          </Pressable>
          <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
            <Text className="text-primary-foreground font-semibold">{initials}</Text>
          </View>
        </View>
      </View>

      <View className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-card-foreground text-lg font-semibold">Today's Targets</Text>
          <TrendingUp size={20} color="#e87d6f" />
        </View>

        <View className="flex-row flex-wrap gap-3">
          {macros.map((macro) => {
            const Icon = macro.icon;
            const percentage = Math.min(100, (macro.value / macro.target) * 100);
            const c = 2 * Math.PI * 32;

            return (
              <View key={macro.label} className="flex-col items-center bg-muted/50 rounded-2xl p-3" style={{ width: '48%' }}>
                <View className="relative w-20 h-20 mb-2">
                  <Svg width={80} height={80} viewBox="0 0 80 80" style={{ transform: [{ rotate: '-90deg' }] }}>
                    <Circle cx={40} cy={40} r={32} fill="none" stroke="#fdf6f0" strokeWidth={6} />
                    <Circle
                      cx={40} cy={40} r={32} fill="none"
                      stroke={macro.color} strokeWidth={6}
                      strokeDasharray={`${(percentage / 100) * c} ${c}`}
                      strokeLinecap="round"
                    />
                  </Svg>
                  <View className="absolute inset-0 items-center justify-center">
                    <Icon size={20} color={macro.color} />
                  </View>
                </View>
                <View className="items-center">
                  <Text className="text-sm text-card-foreground">{macro.value}{macro.unit}</Text>
                  <Text className="text-xs text-muted-foreground">{macro.label}</Text>
                  <Text className="text-[10px] text-muted-foreground">of {macro.target}{macro.unit}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="flex-row gap-3">
        <Pressable
          onPress={onOpenModal}
          className="flex-1 bg-card rounded-3xl p-5 border border-border shadow-sm"
        >
          <View className="w-10 h-10 rounded-2xl bg-secondary items-center justify-center mb-3">
            <Dumbbell size={20} color="#e87d6f" />
          </View>
          <Text className="text-card-foreground font-semibold mb-1">Next Workout</Text>
          <Text className="text-xs text-muted-foreground">Upper Body Power</Text>
          <View className="flex-row items-center gap-2 mt-3">
            <Text className="text-xs text-primary">5:30 PM</Text>
            <Text className="text-xs text-muted-foreground">•</Text>
            <Text className="text-xs text-primary">60 min</Text>
          </View>
        </Pressable>

        <View className="flex-1 bg-card rounded-3xl p-5 border border-border shadow-sm">
          <View className="w-10 h-10 rounded-2xl bg-accent items-center justify-center mb-3">
            <Footprints size={20} color="#9bb88a" />
          </View>
          <Text className="text-card-foreground font-semibold mb-1">Daily Steps</Text>
          <Text className="text-xs text-muted-foreground">6,420 / 10,000</Text>
          <View className="w-full bg-muted rounded-full h-2 mt-3">
            <View className="h-2 rounded-full" style={{ width: '64%', backgroundColor: '#9bb88a' }} />
          </View>
        </View>
      </View>

      <View className="bg-card rounded-3xl p-5 border border-border shadow-sm">
        <Text className="text-card-foreground font-semibold mb-4">Week at a Glance</Text>
        <View className="flex-row justify-between items-end h-24">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const heights = [80, 90, 75, 100, 85, 60, 40];
            const isToday = i === 2;
            return (
              <View key={i} className="flex-col items-center gap-2 flex-1">
                <View className="w-full items-end justify-center h-20">
                  <View
                    className="w-6 rounded-t-lg"
                    style={{
                      height: `${heights[i]}%`,
                      backgroundColor: isToday ? '#e87d6f' : '#ffd5b8',
                    }}
                  />
                </View>
                <Text className={`text-xs ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
