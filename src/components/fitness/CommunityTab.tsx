import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Users } from 'lucide-react-native';
import { BoardId, useCommunityStore, ME } from '../../state/communityStore';
import { BOARDS } from '../../data/boards';
import { PostComposer } from './community/PostComposer';
import { PostCard } from './community/PostCard';

export function CommunityTab() {
  const [active, setActive] = useState<BoardId>('flex');
  const posts = useCommunityStore(s => s.posts);

  const boardPosts = posts
    .filter(p => p.board === active)
    .sort((a, b) => b.createdAt - a.createdAt);

  const activeBoard = BOARDS.find(b => b.id === active)!;

  return (
    <View className="p-5 gap-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-foreground text-2xl font-bold">Community</Text>
          <Text className="text-sm text-muted-foreground">Your crew. Show up for each other.</Text>
        </View>
        <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#e87d6f' }}>
          <Text className="text-primary-foreground font-semibold">{ME.initials}</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {BOARDS.map(b => {
          const isActive = b.id === active;
          return (
            <Pressable
              key={b.id}
              onPress={() => setActive(b.id)}
              className={`p-2 rounded-2xl border flex-col items-center gap-1`}
              style={{
                width: '23%',
                backgroundColor: isActive ? '#e87d6f' : '#ffffff',
                borderColor: isActive ? '#e87d6f' : '#f0d9ce',
              }}
            >
              <Text className="text-lg">{b.emoji}</Text>
              <Text className={`text-[10px] uppercase tracking-wider ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{b.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="rounded-3xl p-4 border border-border flex-row items-center gap-3" style={{ backgroundColor: '#ffd5b8' }}>
        <View className="w-10 h-10 rounded-2xl bg-card flex items-center justify-center flex-shrink-0">
          <Text className="text-xl">{activeBoard.emoji}</Text>
        </View>
        <View className="flex-1">
          <Text style={{ color: '#5a3326' }} className="font-semibold">{activeBoard.label}</Text>
          <Text className="text-xs" style={{ color: 'rgba(90, 51, 38, 0.7)' }}>{activeBoard.tagline}</Text>
        </View>
      </View>

      <PostComposer board={active} placeholder={activeBoard.placeholder} />

      <View className="gap-3">
        {boardPosts.map(p => <PostCard key={p.id} post={p} />)}
        {boardPosts.length === 0 && (
          <View className="bg-muted/50 rounded-3xl p-8 items-center gap-2 border border-dashed border-border">
            <Users size={24} color="#8b7268" />
            <Text className="text-sm text-muted-foreground">Be the first to post here.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
