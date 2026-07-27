import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function AdherenceRing() {
  const nutritionProgress = 85;
  const trainingProgress = 100;
  const stepsProgress = 60;

  const circumference = 2 * Math.PI * 45;

  const dash = (p: number) => `${(p / 100) * circumference} ${circumference}`;

  return (
    <View className="absolute bottom-20 self-center z-30">
      <View className="relative w-24 h-24 rounded-full bg-card border border-border shadow-lg">
        <Svg width={96} height={96} viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={50} cy={50} r={45} fill="none" stroke="#faeadd" strokeWidth={7} />
          <Circle
            cx={50} cy={50} r={45} fill="none"
            stroke="#e87d6f" strokeWidth={7}
            strokeDasharray={dash(nutritionProgress)}
            strokeLinecap="round"
          />
          <Circle
            cx={50} cy={50} r={45} fill="none"
            stroke="#f0a868" strokeWidth={7}
            strokeDasharray={dash(trainingProgress)}
            strokeDashoffset={-circumference * 0.33}
            strokeLinecap="round"
          />
          <Circle
            cx={50} cy={50} r={45} fill="none"
            stroke="#9bb88a" strokeWidth={7}
            strokeDasharray={dash(stepsProgress)}
            strokeDashoffset={-circumference * 0.66}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute inset-0 flex-col items-center justify-center">
          <Text className="text-card-foreground text-xl">82</Text>
          <Text className="text-[10px] text-muted-foreground">Score</Text>
        </View>
      </View>
    </View>
  );
}
