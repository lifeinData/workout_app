import { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { Send } from 'lucide-react-native';
import { BoardId, communityStore, ME } from '../../../state/communityStore';

export function PostComposer({ board, placeholder }: { board: BoardId; placeholder: string }) {
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    communityStore.addPost(board, text.trim());
    setText('');
    Alert.alert('Posted', 'Posted to the board');
  };

  return (
    <View className="bg-card rounded-3xl p-4 border border-border">
      <View className="flex-row gap-3">
        <View className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#e87d6f' }}>
          <Text className="text-sm text-primary-foreground">{ME.initials}</Text>
        </View>
        <View className="flex-1 flex-shrink">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#8b7268"
            multiline
            numberOfLines={2}
            className="w-full bg-transparent text-card-foreground"
            style={{ minHeight: 40, textAlignVertical: 'top' }}
          />

          <View className="flex-row items-center justify-between mt-3">
            <View />
            <Pressable
              onPress={submit}
              disabled={!text.trim()}
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full bg-primary ${!text.trim() ? 'opacity-40' : ''}`}
            >
              <Send size={14} color="#ffffff" />
              <Text className="text-sm text-primary-foreground">Post</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
