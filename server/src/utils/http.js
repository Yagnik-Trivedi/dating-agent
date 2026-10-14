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

/** zod-parse a request body/query, throwing a 400 with readable issues. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw httpError(400, 'VALIDATION', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  return r.data;
}
