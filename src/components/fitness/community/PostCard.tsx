import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Heart, MessageCircle, Send } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Post, communityStore, ME } from '../../../state/communityStore';

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function PostCard({ post }: { post: Post }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  const submitComment = () => {
    if (!commentText.trim()) return;
    communityStore.addComment(post.id, commentText.trim());
    setCommentText('');
    setShowComments(true);
  };

  return (
    <View className="bg-card rounded-3xl border border-border overflow-hidden">
      <View className="p-4">
        <View className="flex-row items-center gap-3 mb-3">
          <View className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <Text className="text-sm text-secondary-foreground">{post.authorInitials}</Text>
          </View>
          <View className="flex-1 flex-shrink">
            <Text className="text-sm text-card-foreground">{post.authorName}</Text>
            <Text className="text-xs text-muted-foreground">{relativeTime(post.createdAt)}</Text>
          </View>
        </View>

        {post.text && (
          <Text className="text-sm text-card-foreground leading-5">{post.text}</Text>
        )}
      </View>

      {post.imageUrl && (
        <Image
          source={{ uri: post.imageUrl }}
          contentFit="cover"
          style={{ width: '100%', maxHeight: 384 }}
        />
      )}

      <View className="px-4 py-3 flex-row items-center gap-4 border-t border-border">
        <Pressable
          onPress={() => communityStore.toggleLike(post.id)}
          className="flex-row items-center gap-1.5"
        >
          <Heart
            size={16}
            color={post.likedByMe ? '#e87d6f' : '#8b7268'}
            fill={post.likedByMe ? '#e87d6f' : 'none'}
          />
          <Text className={`text-sm ${post.likedByMe ? 'text-primary' : 'text-muted-foreground'}`}>{post.likes}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowComments(v => !v)}
          className="flex-row items-center gap-1.5"
        >
          <MessageCircle size={16} color="#8b7268" />
          <Text className="text-sm text-muted-foreground">{post.comments.length}</Text>
        </Pressable>
      </View>

      {showComments && (
        <View className="border-t border-border p-4 gap-3" style={{ backgroundColor: 'rgba(250, 234, 221, 0.4)' }}>
          {post.comments.map(c => (
            <View key={c.id} className="flex-row gap-2">
              <View className="w-7 h-7 rounded-full bg-card flex items-center justify-center flex-shrink-0">
                <Text className="text-[11px] text-card-foreground">{c.authorInitials}</Text>
              </View>
              <View className="flex-1 flex-shrink">
                <View className="bg-card rounded-2xl px-3 py-2">
                  <Text className="text-xs text-card-foreground">{c.authorName}</Text>
                  <Text className="text-sm text-card-foreground">{c.text}</Text>
                </View>
                <Text className="text-[10px] text-muted-foreground mt-1 ml-3">{relativeTime(c.createdAt)}</Text>
              </View>
            </View>
          ))}

          <View className="flex-row gap-2 items-center">
            <View className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#e87d6f' }}>
              <Text className="text-[11px] text-primary-foreground">{ME.initials}</Text>
            </View>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              onSubmitEditing={submitComment}
              returnKeyType="send"
              placeholder="Add a comment…"
              placeholderTextColor="#8b7268"
              className="flex-1 px-3 py-2 rounded-full bg-card border border-border text-sm"
            />
            <Pressable
              onPress={submitComment}
              disabled={!commentText.trim()}
              className={`w-8 h-8 rounded-full bg-primary flex items-center justify-center ${!commentText.trim() ? 'opacity-40' : ''}`}
            >
              <Send size={14} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
