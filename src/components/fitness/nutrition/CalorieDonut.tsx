import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  protein: number;
  carbs: number;
  fat: number;
  target: number;
  size?: number;
  thickness?: number;
  showLegend?: boolean;
}

export function CalorieDonut({ protein, carbs, fat, target, size = 168, thickness = 16, showLegend = true }: Props) {
  const kcalP = protein * 4;
  const kcalC = carbs * 4;
  const kcalF = fat * 9;
  const consumed = kcalP + kcalC + kcalF;
  const totalForArc = Math.max(consumed, target);

  const r = (size / 2) - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;

  const segs = [
    { value: kcalP, color: '#e87d6f' },
    { value: kcalC, color: '#f0a868' },
    { value: kcalF, color: '#c9a86f' },
  ];

  let offset = 0;

  const remaining = Math.max(0, target - consumed);
  const pctOfTarget = target ? Math.round((consumed / target) * 100) : 0;

  return (
    <View className="flex-col items-center">
      <View className="relative" style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#faeadd" strokeWidth={thickness} />
          {segs.map((s, i) => {
            const len = totalForArc ? (s.value / totalForArc) * c : 0;
            const dashOffset = -offset;
            offset += len;
            return (
              <Circle
                key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </Svg>
        <View className="absolute inset-0 flex-col items-center justify-center">
          <Text className="text-card-foreground" style={{ fontSize: size * 0.18 }}>
            {Math.round(consumed)}
          </Text>
          <Text className="text-[10px] text-muted-foreground uppercase tracking-wider">kcal eaten</Text>
          <Text className="text-xs text-muted-foreground mt-1">
            {remaining > 0 ? `${Math.round(remaining)} left` : `${Math.round(consumed - target)} over`}
          </Text>
          <Text className="text-[10px] text-muted-foreground mt-0.5">{pctOfTarget}% of {target}</Text>
        </View>
      </View>

      {showLegend && consumed > 0 && (
        <View className="flex-row items-center gap-4 mt-3">
          <LegendDot color="#e87d6f" label="Protein" pct={Math.round((kcalP / consumed) * 100)} />
          <LegendDot color="#f0a868" label="Carbs"   pct={Math.round((kcalC / consumed) * 100)} />
          <LegendDot color="#c9a86f" label="Fat"     pct={Math.round((kcalF / consumed) * 100)} />
        </View>
      )}
    </View>
  );
}

function LegendDot({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-xs text-card-foreground">{pct}%</Text>
    </View>
  );
}
