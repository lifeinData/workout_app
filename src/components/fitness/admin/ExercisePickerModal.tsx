import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Plus, Search, X } from "lucide-react-native";
import { useExercises } from "@/lib/queries";
import type { ExerciseResponse } from "@/lib/api";

export interface ExercisePickerModalProps {
  visible: boolean;
  onClose: () => void;
  alreadyInWorkout: ReadonlySet<string>;
  onSelect: (ex: ExerciseResponse) => void;
}

export function ExercisePickerModal({
  visible,
  onClose,
  alreadyInWorkout,
  onSelect,
}: ExercisePickerModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  /* Debounce: avoid a request per keystroke. 250ms coalesces typing
   * bursts without feeling laggy. The backend's `q` filter is a
   * substring match on name. */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: exercises, isLoading } = useExercises({
    search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    limit: 500,
  });

  const list = exercises ?? [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-foreground/50">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close picker"
        />
        <View className="bg-background rounded-t-[28px] max-h-[85%] min-h-[70%] overflow-hidden">
          <View className="flex-row items-center justify-between p-5 border-b border-border bg-card gap-3">
            <View className="flex-1">
              <Text className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] font-semibold">
                Catalog
              </Text>
              <Text className="text-xl font-bold text-foreground mt-0.5">
                Add exercise
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityLabel="Close picker"
            >
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>

          <View className="flex-row items-center p-4">
            <View className="absolute left-[26px] top-0 bottom-0 justify-center z-10">
              <Search size={16} color="#8b7268" />
            </View>
            <TextInput
              autoFocus
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search exercises…"
              placeholderTextColor="#8b7268"
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>

          {isLoading ? (
            <View className="p-8 items-center">
              <ActivityIndicator color="#e87d6f" />
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-4 pb-4 gap-1.5"
              keyboardShouldPersistTaps="handled"
            >
              {list.length === 0 ? (
                <View className="bg-muted/50 rounded-2xl p-4 items-center border border-dashed border-border">
                  <Text className="text-sm text-muted-foreground">No exercises match.</Text>
                </View>
              ) : (
                list.map((ex) => {
                  const already = alreadyInWorkout.has(ex.id);
                  return (
                    <Pressable
                      key={ex.id}
                      onPress={() => onSelect(ex)}
                      disabled={already}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        already && styles.pickerRowAlready,
                        pressed && !already && styles.pickerRowPressed,
                      ]}
                    >
                      <View className="flex-1 min-w-0">
                        <Text
                          className={`text-sm font-semibold ${already ? "text-muted-foreground" : "text-foreground"}`}
                          numberOfLines={1}
                        >
                          {ex.name}
                        </Text>
                        <Text
                          className="text-[11px] text-muted-foreground mt-0.5"
                          numberOfLines={1}
                        >
                          {ex.muscle_group}
                        </Text>
                      </View>
                      {already ? (
                        <Text className="text-[11px] text-muted-foreground uppercase tracking-[1px] font-semibold">
                          In workout
                        </Text>
                      ) : (
                        <View className="w-[30px] h-[30px] rounded-full bg-primary items-center justify-center">
                          <Plus size={14} color="#ffffff" strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          <View className="p-4 bg-card border-t border-border">
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
            >
              <Text className="text-[15px] text-white font-bold">Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#faeadd",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  searchInput: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f0d9ce",
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 12,
    fontSize: 14,
    color: "#3d2b26",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f0d9ce",
  },
  pickerRowAlready: { opacity: 0.55 },
  pickerRowPressed: { backgroundColor: "#faeadd" },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#e87d6f",
    alignItems: "center",
    justifyContent: "center",
  },
});
