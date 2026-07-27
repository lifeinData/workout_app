import { useState } from 'react';
import { Users } from 'lucide-react';
import { BoardId, useCommunityStore, ME } from '../state/communityStore';
import { BOARDS } from './community/boards';
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
    <div className="p-5 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Community</h1>
          <p className="text-sm text-muted-foreground">Your crew. Show up for each other.</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground">
          {ME.initials}
        </div>
      </div>

      {/* Board switcher */}
      <div className="grid grid-cols-4 gap-2">
        {BOARDS.map(b => {
          const isActive = b.id === active;
          return (
            <button
              key={b.id}
              onClick={() => setActive(b.id)}
              className={`p-2 rounded-2xl border transition-all flex flex-col items-center gap-1 ${
                isActive
                  ? 'bg-primary border-primary text-primary-foreground shadow-md shadow-primary/30'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <span className="text-lg">{b.emoji}</span>
              <span className="text-[10px] uppercase tracking-wider">{b.label}</span>
            </button>
          );
        })}
      </div>

      {/* Board tagline */}
      <div className="bg-gradient-to-br from-accent to-secondary rounded-3xl p-4 border border-border shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-card flex items-center justify-center text-xl flex-shrink-0">
          {activeBoard.emoji}
        </div>
        <div>
          <div className="text-accent-foreground">{activeBoard.label}</div>
          <div className="text-xs text-accent-foreground/70">{activeBoard.tagline}</div>
        </div>
      </div>

      <PostComposer board={active} placeholder={activeBoard.placeholder} />

      <div className="space-y-3">
        {boardPosts.map(p => <PostCard key={p.id} post={p} />)}
        {boardPosts.length === 0 && (
          <div className="bg-muted/50 rounded-3xl p-8 text-center text-sm text-muted-foreground border border-dashed border-border flex flex-col items-center gap-2">
            <Users className="w-6 h-6 text-muted-foreground" />
            Be the first to post here.
          </div>
        )}
      </div>
    </div>
  );
}
