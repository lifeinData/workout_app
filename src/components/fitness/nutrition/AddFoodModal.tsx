import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView } from 'react-native';
import { Search, X, Plus } from 'lucide-react-native';
import { FOODS, Food, scale } from './foodDatabase';

interface Props {
  meal: string;
  onClose: () => void;
  onAdd: (foodId: string, grams: number) => void;
}

export function AddFoodModal({ meal, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number>(100);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FOODS.slice(0, 8);
    return FOODS.filter(f =>
      f.name.toLowerCase().includes(q) || f.brand?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query]);

  const preview = selected ? scale(selected.per100g, grams) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} />

        <View className="bg-card rounded-t-3xl border-t border-x border-border max-h-[85%] flex flex-col">
          <View className="flex-row items-center justify-between p-5 border-b border-border">
            <View>
              <Text className="text-xs text-muted-foreground">Add to</Text>
              <Text className="text-xl font-bold text-card-foreground">{meal}</Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
            >
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>

          {!selected ? (
            <>
              <View className="p-5 pb-3">
                <View className="relative">
                  <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
                    <Search size={16} color="#8b7268" />
                  </View>
                  <TextInput
                    autoFocus
                    placeholder="Search foods…"
                    value={query}
                    onChangeText={setQuery}
                    className="w-full pl-11 pr-4 py-3 bg-muted border border-border rounded-2xl text-foreground"
                    placeholderTextColor="#8b7268"
                  />
                </View>
              </View>

              <ScrollView className="flex-1 px-5 pb-5" contentContainerStyle={{ gap: 8 }}>
                {results.map(food => (
                  <Pressable
                    key={food.id}
                    onPress={() => { setSelected(food); setGrams(food.servingSize); }}
                    className="w-full flex-row items-center justify-between p-4 rounded-2xl bg-muted/60 border border-transparent"
                  >
                    <View className="flex-1 flex-shrink pr-3">
                      <Text className="text-card-foreground" numberOfLines={1}>{food.name}</Text>
                      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                        {food.brand ? `${food.brand} • ` : ''}{food.servingLabel}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-3 flex-shrink-0">
                      <View className="items-end">
                        <Text className="text-sm text-card-foreground">
                          {Math.round(scale(food.per100g, food.servingSize).calories)} kcal
                        </Text>
                        <Text className="text-[10px] text-muted-foreground">per serving</Text>
                      </View>
                      <View className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Plus size={16} color="#ffffff" />
                      </View>
                    </View>
                  </Pressable>
                ))}
                {results.length === 0 && (
                  <View className="items-center py-10">
                    <Text className="text-sm text-muted-foreground">
                      No foods found. Try a different search.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          ) : (
            <ScrollView className="flex-1 p-5" contentContainerStyle={{ gap: 20 }}>
              <View>
                <Text className="text-xl font-bold text-card-foreground">{selected.name}</Text>
                {selected.brand && (
                  <Text className="text-sm text-muted-foreground">{selected.brand}</Text>
                )}
              </View>

              <View>
                <Text className="text-sm text-muted-foreground mb-2">Serving (grams)</Text>
                <View className="flex-row items-center gap-3">
                  <TextInput
                    keyboardType="numeric"
                    value={String(grams)}
                    onChangeText={(v) => setGrams(Math.max(0, Number(v) || 0))}
                    className="flex-1 px-4 py-3 bg-muted border border-border rounded-2xl text-foreground"
                  />
                  <Pressable
                    onPress={() => setGrams(selected.servingSize)}
                    className="px-4 py-3 rounded-2xl bg-secondary"
                  >
                    <Text className="text-sm text-secondary-foreground whitespace-nowrap">{selected.servingLabel}</Text>
                  </Pressable>
                </View>
              </View>

              {preview && (
                <View className="bg-muted/60 rounded-2xl p-4 gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-card-foreground">Calories</Text>
                    <Text className="text-card-foreground">{Math.round(preview.calories)} kcal</Text>
                  </View>
                  <View className="flex-row gap-2 pt-2 border-t border-border">
                    <Stat label="Protein" value={`${preview.protein.toFixed(1)}g`} color="#e87d6f" />
                    <Stat label="Carbs" value={`${preview.carbs.toFixed(1)}g`} color="#f0a868" />
                    <Stat label="Fat" value={`${preview.fat.toFixed(1)}g`} color="#c9a86f" />
                  </View>
                </View>
              )}

              <View className="flex-row gap-3 pt-2">
                <Pressable
                  onPress={() => setSelected(null)}
                  className="flex-1 py-3 rounded-2xl bg-secondary items-center"
                >
                  <Text className="text-secondary-foreground">Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => { onAdd(selected.id, grams); onClose(); }}
                  className="flex-1 py-3 rounded-2xl bg-primary items-center"
                >
                  <Text className="text-primary-foreground">Add to {meal}</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[11px] text-muted-foreground mb-1">{label}</Text>
      <Text className="text-sm" style={{ color }}>{value}</Text>
    </View>
  );
}
