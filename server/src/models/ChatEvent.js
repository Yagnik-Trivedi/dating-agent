import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// A notable moment ONE side's agent recorded during a chat (plan 08 §2.1). Mine only: never shown to the other side.
export const CHAT_EVENT_TYPES = ['shared_interest', 'interest_clash', 'laugh', 'disagreement', 'disagreement_resolved', 'low_effort', 'boredom', 'warmth', 'question_dodged', 'dealbreaker_hint'];

const chatEventSchema = new mongoose.Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  matchId: { type: ObjectId, ref: 'Match', required: true },
  observerId: { type: ObjectId, ref: 'User', required: true },
  turn: Number,
  messageId: { type: ObjectId, ref: 'Message' },
  quote: String, // verbatim from their message
  type: { type: String, enum: CHAT_EVENT_TYPES, required: true },
  conceptId: { type: ObjectId, ref: 'Concept', default: null },
  label: String, // e.g. the concept or attribute
  weight: { type: Number, default: 0.5 },
  archiveAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

chatEventSchema.index({ conversationId: 1, observerId: 1 });
chatEventSchema.index({ archiveAt: 1 }, { expireAfterSeconds: 0 });

export const ChatEvent = mongoose.model('ChatEvent', chatEventSchema);
