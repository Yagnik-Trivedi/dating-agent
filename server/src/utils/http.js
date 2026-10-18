import mongoose from 'mongoose';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

export const httpError = (status, code, message) => new HttpError(status, code, message);

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'invalid id');

// Plain sentences for the fields people type (plan 30 S0): never raw zod text in the UI.
const LABEL = {
  email: 'your email', password: 'a password', name: 'your first name', dob: 'your date of birth', gender: 'your gender',
  interestedIn: 'who you’re interested in', city: 'your city', consentAgent: 'the consent box', age: 'your age',
};
function sentence(issue) {
  const key = issue.path[0];
  const label = LABEL[key];
  if (!label) return `${issue.path.join('.') || 'body'}: ${issue.message}`; // API-only fields keep the technical detail
  if (key === 'password' && issue.code === 'too_small') return `Your password needs at least ${issue.minimum} characters.`;
  if (key === 'email' && issue.code === 'invalid_format') return 'Please enter a valid email address.';
  if (issue.code === 'too_big') return `Please shorten ${label}.`;
  if (issue.code === 'invalid_type' || issue.code === 'too_small') return `Please enter ${label}.`;
  return `Please check ${label}.`;
}

/** zod-parse a request body/query, throwing a 400 with readable issues. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw httpError(400, 'VALIDATION', [...new Set(r.error.issues.map(sentence))].join(' '));
  }
  return r.data;
}
