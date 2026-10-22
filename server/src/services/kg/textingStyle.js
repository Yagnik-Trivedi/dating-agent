// Plan 32 KP1 (A6.9): "How do you usually text?", a tap-only self-report. It beats what onboarding typed on a laptop
// shows (no emoji, one long message). Stored on User.textingStyle, so a graph rebuild never loses it; the voice profile
// blends it in as a prior (voiceProfile.js). Stickers and GIFs are recorded as a habit only: the agent sends text.
import { z } from 'zod';

export const TEXTING_STYLE = [
  { id: 'emoji', text: 'Emoji', options: [['a_lot', 'A lot'], ['some', 'Some'], ['rarely', 'Rarely']] },
  { id: 'bursts', text: 'When you reply', options: [['several', 'Several short messages'], ['one', 'One longer message']] },
  { id: 'length', text: 'Your messages are usually', options: [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']] },
  { id: 'caps', text: 'Capital letters', options: [['lowercase', 'all lowercase'], ['normal', 'Normal Capitals']] },
  { id: 'stickers', text: 'Stickers or GIFs', options: [['often', 'Often'], ['sometimes', 'Sometimes'], ['never', 'Never']] },
].map((q) => ({ ...q, options: q.options.map(([value, label]) => ({ value, label })) }));

/** Any subset (each question is skippable); unknown keys are rejected. */
export const textingStyleSchema = z.object(Object.fromEntries(TEXTING_STYLE.map((q) => [q.id, z.enum(q.options.map((o) => o.value))]))).partial().strict();

export const DEVICES = ['mobile', 'desktop'];
