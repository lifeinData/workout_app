import { useSyncExternalStore } from 'react';

export type BoardId = 'flex' | 'steps' | 'nomz' | 'qa';

export interface Comment {
  id: string;
  authorName: string;
  authorInitials: string;
  text: string;
  createdAt: number;
}

export interface Post {
  id: string;
  board: BoardId;
  authorName: string;
  authorInitials: string;
  createdAt: number;
  text: string;
  imageUrl?: string;
  likes: number;
  likedByMe: boolean;
  comments: Comment[];
}

interface State { posts: Post[]; }

const HOUR = 1000 * 60 * 60;
const now = Date.now();

const state: State = {
  posts: [
    // FLEX IT
    { id: 'p1', board: 'flex', authorName: 'Marcus T.',  authorInitials: 'MT', createdAt: now - 2*HOUR,
      text: 'Hit 405 deadlift today — 8 months of grinding finally paid off 💪',
      imageUrl: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800',
      likes: 24, likedByMe: false, comments: [
        { id: 'c1', authorName: 'Sarah J.', authorInitials: 'SJ', text: 'INSANE! What\'s next, 4 plates?', createdAt: now - HOUR },
      ]},
    { id: 'p2', board: 'flex', authorName: 'Priya R.',   authorInitials: 'PR', createdAt: now - 8*HOUR,
      text: '12 weeks in. Same shirt, same lighting. Slow and steady.',
      imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
      likes: 47, likedByMe: true, comments: []},
    { id: 'p3', board: 'flex', authorName: 'Jordan D.',  authorInitials: 'JD', createdAt: now - 24*HOUR,
      text: 'First unassisted pull-up. Logged it. Coach said "told you so" 😅',
      likes: 31, likedByMe: false, comments: []},

    // STEP IT OUT
    { id: 'p4', board: 'steps', authorName: 'Elena V.',  authorInitials: 'EV', createdAt: now - 3*HOUR,
      text: 'Day 18 of the 10k streak. Who else is in? 🚶‍♀️',
      imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
      likes: 18, likedByMe: false, comments: [
        { id: 'c2', authorName: 'Tom K.', authorInitials: 'TK', text: 'Day 22 here, let\'s gooo', createdAt: now - 2*HOUR },
      ]},
    { id: 'p5', board: 'steps', authorName: 'Aiden L.',  authorInitials: 'AL', createdAt: now - 30*HOUR,
      text: 'Anyone want a buddy for the weekend hike challenge? Looking at 20k Saturday.',
      likes: 9, likedByMe: false, comments: []},
    { id: 'p6', board: 'steps', authorName: 'Maya S.',   authorInitials: 'MS', createdAt: now - 50*HOUR,
      text: 'Walking meetings are a cheat code. 6k before lunch 📞',
      likes: 14, likedByMe: true, comments: []},

    // NOMZ
    { id: 'p7', board: 'nomz', authorName: 'Carlos B.',  authorInitials: 'CB', createdAt: now - 1*HOUR,
      text: 'Salmon bowl — 45g protein, 520 kcal, takes 12 min. Recipe in comments.',
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
      likes: 36, likedByMe: false, comments: [
        { id: 'c3', authorName: 'Carlos B.', authorInitials: 'CB', text: 'Brown rice, salmon, avocado, cucumber, soy-tahini drizzle.', createdAt: now - 30*60*1000 },
      ]},
    { id: 'p8', board: 'nomz', authorName: 'Hannah W.',  authorInitials: 'HW', createdAt: now - 12*HOUR,
      text: 'Greek yogurt parfait stack — 30g protein breakfast for under 5 mins.',
      imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800',
      likes: 22, likedByMe: false, comments: []},
    { id: 'p9', board: 'nomz', authorName: 'Devon P.',   authorInitials: 'DP', createdAt: now - 40*HOUR,
      text: 'Found a low-sodium hot sauce that actually slaps. Game changer for cutting.',
      likes: 11, likedByMe: false, comments: []},

    // Q&A
    { id: 'p10', board: 'qa', authorName: 'Nia O.',  authorInitials: 'NO', createdAt: now - 5*HOUR,
      text: 'How do you all handle protein on travel days? Bars are getting old.',
      likes: 7, likedByMe: false, comments: [
        { id: 'c4', authorName: 'Coach Ros',  authorInitials: 'CR', text: 'Try a shaker + single-serve whey packets. Greek yogurt cups if airport-side.', createdAt: now - 4*HOUR },
      ]},
    { id: 'p11', board: 'qa', authorName: 'Ben H.',  authorInitials: 'BH', createdAt: now - 20*HOUR,
      text: 'Should I deload this week? Bar speed has been off and sleep is rough.',
      likes: 4, likedByMe: false, comments: []},
    { id: 'p12', board: 'qa', authorName: 'Lina F.', authorInitials: 'LF', createdAt: now - 36*HOUR,
      text: 'What\'s the move when you miss a workout — push back the rest of the week or skip and move on?',
      likes: 12, likedByMe: false, comments: []},
  ],
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const ME = { name: 'Jordan D.', initials: 'JD' };

export const communityStore = {
  getState: () => state,

  addPost(board: BoardId, text: string, imageUrl?: string) {
    const post: Post = {
      id: `p${Date.now()}`, board,
      authorName: ME.name, authorInitials: ME.initials,
      createdAt: Date.now(),
      text, imageUrl,
      likes: 0, likedByMe: false, comments: [],
    };
    state.posts = [post, ...state.posts];
    emit();
  },

  toggleLike(postId: string) {
    state.posts = state.posts.map(p => p.id === postId ? {
      ...p,
      likedByMe: !p.likedByMe,
      likes: p.likes + (p.likedByMe ? -1 : 1),
    } : p);
    emit();
  },

  addComment(postId: string, text: string) {
    const comment: Comment = {
      id: `c${Date.now()}`, authorName: ME.name, authorInitials: ME.initials,
      text, createdAt: Date.now(),
    };
    state.posts = state.posts.map(p => p.id === postId ? { ...p, comments: [...p.comments, comment] } : p);
    emit();
  },
};

export function useCommunityStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}
