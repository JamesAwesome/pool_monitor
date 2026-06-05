/** Curated anonymous starter roster — seeds "recent swimmers" before any history. */
export const SWIM_EMOJI: string[] = [
  '🦦', '🐢', '🐬', '🦆', '🐸', '🦭',
  '🐙', '🐠', '🦀', '🦩', '🏊', '🤿',
];

export interface EmojiCategory { cat: string; list: string[] }

/** Categorized picker set behind the ＋ tile (a representative subset, not all Unicode). */
export const EMOJI_KEYBOARD: EmojiCategory[] = [
  { cat: 'Sea & animals', list: ['🦦', '🐢', '🐬', '🦭', '🐳', '🐋', '🦈', '🐙', '🐠', '🐟', '🐡', '🦑', '🦀', '🦞', '🦐', '🐚', '🐊', '🐸', '🦎', '🐍', '🦆', '🦢', '🦩', '🐧', '🐥', '🦔', '🐶', '🐱', '🦊', '🐼', '🐨', '🐵', '🦄'] },
  { cat: 'Water people', list: ['🏊', '🏊‍♀️', '🏊‍♂️', '🤿', '🤽', '🤽‍♀️', '🤽‍♂️', '🏄', '🏄‍♀️', '🏄‍♂️', '🚣', '🤾', '🧜', '🧜‍♀️', '🧜‍♂️', '🧗', '🤸', '⛹️'] },
  { cat: 'People', list: ['🧑', '👦', '👧', '👶', '👩', '👨', '🧓', '👵', '👴', '🧒', '👱', '🧔', '👮', '🕵️', '👷', '🤴', '👸', '🧙', '🦸', '🦹', '🤡', '👻', '🤖', '👽'] },
  { cat: 'Smileys', list: ['😀', '😄', '😁', '😆', '😅', '😂', '🙂', '😊', '😇', '😍', '🤩', '😎', '🥳', '😜', '🤪', '😝', '🤗', '🤔', '😴', '🥶', '🥵', '😤', '😈', '🤠'] },
  { cat: 'Fun & objects', list: ['⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '☀️', '🌈', '🍉', '🍑', '🥥', '🍦', '🎈', '🎉', '🏆', '🥇', '🏅', '⚽', '🏐', '🛟', '🦺', '👑', '💎'] },
];
