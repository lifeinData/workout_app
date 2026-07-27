import { useState } from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { Post, communityStore, ME } from '../../state/communityStore';
import { ImageWithFallback } from '../figma/ImageWithFallback';

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
    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-sm">
            {post.authorInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-card-foreground">{post.authorName}</div>
            <div className="text-xs text-muted-foreground">{relativeTime(post.createdAt)}</div>
          </div>
        </div>

        {post.text && (
          <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap">{post.text}</p>
        )}
      </div>

      {post.imageUrl && (
        <ImageWithFallback
          src={post.imageUrl}
          alt="Post"
          className="w-full max-h-96 object-cover"
        />
      )}

      <div className="px-4 py-3 flex items-center gap-4 border-t border-border">
        <button
          onClick={() => communityStore.toggleLike(post.id)}
          className="flex items-center gap-1.5 text-sm transition-colors"
        >
          <Heart className={`w-4 h-4 ${post.likedByMe ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
          <span className={post.likedByMe ? 'text-primary' : 'text-muted-foreground'}>{post.likes}</span>
        </button>
        <button
          onClick={() => setShowComments(v => !v)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          {post.comments.length}
        </button>
      </div>

      {showComments && (
        <div className="bg-muted/40 border-t border-border p-4 space-y-3">
          {post.comments.map(c => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-card text-card-foreground flex items-center justify-center text-[11px] flex-shrink-0">
                {c.authorInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-card rounded-2xl px-3 py-2">
                  <div className="text-xs text-card-foreground">{c.authorName}</div>
                  <div className="text-sm text-card-foreground">{c.text}</div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 ml-3">{relativeTime(c.createdAt)}</div>
              </div>
            </div>
          ))}

          <div className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center text-[11px] flex-shrink-0">
              {ME.initials}
            </div>
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              placeholder="Add a comment…"
              className="flex-1 px-3 py-2 rounded-full bg-card border border-border outline-none text-sm focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={submitComment}
              disabled={!commentText.trim()}
              className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
