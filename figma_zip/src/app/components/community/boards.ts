import { BoardId } from '../../state/communityStore';

export const BOARDS: { id: BoardId; label: string; emoji: string; tagline: string; placeholder: string }[] = [
  { id: 'flex',  label: 'FLEX IT',      emoji: '💪', tagline: 'PRs, progress pics, body changes',  placeholder: 'Share a win, a PR, a progress pic…' },
  { id: 'steps', label: 'STEP IT OUT', emoji: '👟', tagline: 'Step challenges & accountability',   placeholder: 'Drop your step count, challenge a friend…' },
  { id: 'nomz',  label: 'NOMZ',         emoji: '🍳', tagline: 'Meals, recipes, food finds',         placeholder: 'What did you cook? Macros welcome…' },
  { id: 'qa',    label: 'Q&A',          emoji: '❓', tagline: 'Questions for the coach & community', placeholder: 'Ask anything — coaches & community will weigh in…' },
];
