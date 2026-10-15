import mongoose from 'mongoose';

// Web search results (summarized) by query string. Mongo's TTL index drops entries after 7 days.
const searchCacheSchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true },
  ideas: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
}, { versionKey: false });

export const SearchCache = mongoose.model('SearchCache', searchCacheSchema);
