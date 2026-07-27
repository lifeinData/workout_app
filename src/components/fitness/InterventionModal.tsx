import { View, Text, Pressable, Modal } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import { useState } from 'react';

interface InterventionModalProps {
  onClose: () => void;
}

export function InterventionModal({ onClose }: InterventionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const reasons = [
    'Ran out of time',
    'Forgot my gear',
    'Not feeling well',
    'Change of plans',
  ];

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-foreground/40" onPress={onClose} />

        <View className="w-full bg-card rounded-t-3xl border-t border-x border-border shadow-2xl">
          <View className="absolute top-3 right-3">
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-muted items-center justify-center"
            >
              <X size={20} color="#8b7268" />
            </Pressable>
          </View>

          <View className="p-7 pb-9">
            <View className="flex-row items-center gap-3 mb-5">
              <View className="w-12 h-12 rounded-2xl bg-secondary items-center justify-center">
                <Sparkles size={24} color="#e87d6f" />
              </View>
              <Text className="text-card-foreground text-lg font-semibold">Let's adjust.</Text>
            </View>

            <Text className="text-muted-foreground mb-6 leading-relaxed">
              Looks like the gym didn't happen today. What got in the way?
            </Text>

            <View className="gap-2 mb-7">
              {reasons.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => setSelectedReason(reason)}
                  className={`w-full p-4 rounded-2xl border-2 ${
                    selectedReason === reason
                      ? 'bg-secondary border-primary'
                      : 'bg-muted/50 border-transparent'
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-card-foreground">{reason}</Text>
                    <View
                      className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                        selectedReason === reason
                          ? 'bg-primary border-primary'
                          : 'border-border'
                      }`}
                    >
                      {selectedReason === reason && (
                        <View className="w-2 h-2 rounded-full bg-primary-foreground" />
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={onClose}
              disabled={!selectedReason}
              className="w-full bg-primary rounded-2xl p-4 shadow-lg disabled:opacity-40"
            >
              <Text className="text-primary-foreground text-center font-semibold">Submit</Text>
            </Pressable>

            <Text className="text-center text-sm text-muted-foreground mt-4">
              Your coach will adjust your plan accordingly
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
