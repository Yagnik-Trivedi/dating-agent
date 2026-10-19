// Plan 30 S3.1 photos: Cloudinary signed direct uploads (no SDK) or a local stub, one vision moderation call per
// photo (the model describes, code decides), and Profile.photos = the moderated-ok uploads in order.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Profile } from '../models/Profile.js';
import { httpError } from '../utils/http.js';
import { enqueue } from './jobs/queue.js';
import { chatJSON } from './llm/client.js';
import * as prompt from './prompts/photoModeration.js';
import { queueProfileCheck } from './trust/checkProfile.js';

export const MAX_PHOTOS = 6;
export const UPLOAD_DIR = new URL('../../uploads/', import.meta.url); // local stub only (gitignored)
const FOLDER = 'prelude';
export const cloudinaryOn = () => Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
const sign = (params) => createHash('sha1')
  .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + env.CLOUDINARY_API_SECRET).digest('hex');

/** What the client needs for a direct upload. Without Cloudinary keys: { stub: true } (send the JPEG to POST /photos). */
export function uploadTicket() {
  if (!cloudinaryOn()) return { stub: true };
  const timestamp = Math.floor(Date.now() / 1000);
  return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, timestamp, folder: FOLDER, signature: sign({ folder: FOLDER, timestamp }) };
}

/** An uploaded image: a Cloudinary result from our folder, or (stub) the JPEG itself. → { url, publicId, w, h } */
export async function storeImage(body, baseUrl) {
  if (cloudinaryOn()) {
    const prefix = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
    if (!body.url?.startsWith(prefix) || !body.publicId?.startsWith(`${FOLDER}/`)) throw httpError(400, 'VALIDATION', 'Upload the photo first.');
    return { url: body.url, publicId: body.publicId, w: body.w, h: body.h };
  }
  if (!body.jpegBase64) throw httpError(400, 'VALIDATION', 'Photo missing.');
  const name = `${randomUUID()}.jpg`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(new URL(name, UPLOAD_DIR), Buffer.from(body.jpegBase64, 'base64'));
  return { url: `${baseUrl}/uploads/${name}`, publicId: name, w: body.w, h: body.h };
}

/** A chat photo (S3.7): checked before it's sent; rejected or uncheckable photos are deleted and never sent. */
export async function checkedChatImage(body, baseUrl, userId) {
  const image = await storeImage(body, baseUrl);
  let decision;
  try {
    decision = decidePhoto(await describePhoto(image, userId), { first: false });
  } catch {
    await destroy(image).catch(() => {});
    throw httpError(503, 'PHOTO_CHECK_UNAVAILABLE', 'We can’t check photos right now. Try again in a minute.');
  }
  if (decision.status !== 'ok') {
    await destroy(image).catch(() => {});
    throw httpError(400, 'PHOTO_NOT_ALLOWED', decision.reasons[0]);
  }
  return { kind: 'image', url: image.url, w: image.w, h: image.h };
}

/** Add a profile photo upload. Moderation runs as a job. */
export async function addPhoto(userId, body, baseUrl) {
  const profile = await Profile.findOne({ userId }, { photoUploads: 1 }).lean();
  if ((profile?.photoUploads?.length ?? 0) >= MAX_PHOTOS) throw httpError(400, 'TOO_MANY_PHOTOS', `You can add up to ${MAX_PHOTOS} photos.`);
  const upload = await storeImage(body, baseUrl);
  const saved = await Profile.findOneAndUpdate({ userId }, { $push: { photoUploads: { ...upload, status: 'pending', at: new Date() } } }, { new: true, projection: { photoUploads: 1 } }).lean();
  const added = saved.photoUploads.at(-1);
  await enqueue('moderatePhoto', { userId: String(userId), photoId: String(added._id) }, { dedupeKey: `photo:${added._id}`, maxAttempts: 8 });
  return added;
}

/** Profile.photos follows the uploads: only 'ok' ones, in upload order. */
async function syncPublic(userId) {
  const p = await Profile.findOne({ userId }, { photoUploads: 1 }).lean();
  await Profile.updateOne({ userId }, { $set: { photos: (p?.photoUploads ?? []).filter((u) => u.status === 'ok').map((u) => u.url) } });
  queueProfileCheck(userId); // photo count and moderation results feed the self-check
}

export async function removePhoto(userId, photoId) {
  const p = await Profile.findOne({ userId }, { photoUploads: 1 }).lean();
  const photo = p?.photoUploads?.find((u) => String(u._id) === photoId);
  if (!photo) throw httpError(404, 'NOT_FOUND', 'Photo not found');
  await Profile.updateOne({ userId }, { $pull: { photoUploads: { _id: photo._id } } });
  await syncPublic(userId);
  await destroy(photo).catch((err) => console.error(`photo ${photoId}: delete from storage failed: ${err.message}`));
}

async function destroy(photo) {
  if (!cloudinaryOn()) return unlink(new URL(photo.publicId, UPLOAD_DIR));
  const timestamp = Math.floor(Date.now() / 1000);
  const form = new URLSearchParams({ public_id: photo.publicId, timestamp, api_key: env.CLOUDINARY_API_KEY, signature: sign({ public_id: photo.publicId, timestamp }) });
  await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
}

/** New order (every photo id once). The first photo must show a person once it's moderated. */
export async function reorderPhotos(userId, ids) {
  const p = await Profile.findOne({ userId }, { photoUploads: 1 }).lean();
  const byId = new Map((p?.photoUploads ?? []).map((u) => [String(u._id), u]));
  if (ids.length !== byId.size || !ids.every((id) => byId.has(id))) throw httpError(400, 'VALIDATION', 'Send every photo once.');
  if (byId.get(ids[0]).person === false) throw httpError(400, 'FIRST_PHOTO', 'Your first photo needs to show you.');
  await Profile.updateOne({ userId }, { $set: { photoUploads: ids.map((id) => byId.get(id)) } });
  await syncPublic(userId);
}

const flag = z.preprocess((v) => v === true || v === 'true', z.boolean()); // coerce.boolean would turn "false" into true
export const verdictSchema = z.object({
  personVisible: flag, faceCount: z.coerce.number().int().min(0).catch(0),
  nudity: flag, violence: flag, mostlyText: flag, contactDetails: flag, qrCode: flag, socialHandle: flag,
});

/** Code decides from the model's description. → { status: 'ok' | 'rejected', reasons } */
export function decidePhoto(v, { first }) {
  const reasons = [
    v.nudity && 'Nudity or sexual content isn’t allowed.',
    v.violence && 'Violent content isn’t allowed.',
    v.mostlyText && 'Photos that are mostly text aren’t allowed.',
    v.contactDetails && 'Photos can’t show contact details.',
    v.qrCode && 'Photos can’t show a QR code.',
    v.socialHandle && 'Photos can’t show a social media handle.',
    first && !v.personVisible && 'Your first photo needs to show you.',
  ].filter(Boolean);
  return { status: reasons.length ? 'rejected' : 'ok', reasons };
}

/** `moderatePhoto` job. A model error throws, so the queue retries; until then the photo stays pending. */
export async function moderatePhoto({ userId, photoId }, { describe = describePhoto } = {}) {
  const p = await Profile.findOne({ userId }, { photoUploads: 1 }).lean();
  const idx = p?.photoUploads?.findIndex((u) => String(u._id) === photoId) ?? -1;
  if (idx < 0) return; // deleted meanwhile
  const photo = p.photoUploads[idx];
  const v = await describe(photo, userId);
  const { status, reasons } = decidePhoto(v, { first: idx === 0 });
  await Profile.updateOne({ userId, 'photoUploads._id': photo._id }, { $set: {
    'photoUploads.$.status': status, 'photoUploads.$.reasons': reasons, 'photoUploads.$.person': v.personVisible, 'photoUploads.$.at': new Date(),
  } });
  await syncPublic(userId);
}

async function describePhoto(photo, userId) {
  const bytes = cloudinaryOn()
    ? Buffer.from(await (await fetch(photo.url.replace('/image/upload/', '/image/upload/w_768,c_limit,f_jpg/'))).arrayBuffer())
    : await readFile(new URL(photo.publicId, UPLOAD_DIR));
  return chatJSON({ tier: 'vision', temperature: 0, reasoning: false, purpose: 'photo-moderation', userId, schema: verdictSchema, messages: prompt.build({ jpegBase64: bytes.toString('base64') }), retries: 1 });
}
