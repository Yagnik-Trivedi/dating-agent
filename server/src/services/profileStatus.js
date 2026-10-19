// Plan 30 S2: who is shown in Discover and can match. A profile's status comes from the scam self-check on its own
// public profile (+ photo moderation) and the live check:
//   held        high risk: "Your profile needs a fix" until they fix it or an admin releases it
//   browse_only no live check yet: can browse and like, isn't shown to others, likes are delivered once active
//   active      everything
// Profiles without a status (seeds, accounts from before plan 30) are active and never gated.
import { env } from '../config/env.js';
import { Like } from '../models/Like.js';
import { Profile } from '../models/Profile.js';
import { createMatch } from './matches.js';
import { checkProfileData, precheckProfile, profileVersion } from './trust/checkProfile.js';

const CONTACT_PHOTO = /contact|qr|handle|phone/i;

/** Status for a new account: the live check is required only when it's switched on. */
export const initialStatus = () => (env.LIVE_CHECK_ENABLED ? 'browse_only' : 'active');

/** The scam self-check on my own public profile. → { level: low | medium | high, reasons } */
export async function selfCheck(profile) {
  const check = await checkProfileData({ profile, userId: profile.userId }); // account age doesn't apply to yourself
  const photoContact = (profile.photoUploads ?? []).some((p) => p.status === 'rejected' && p.reasons?.some((r) => CONTACT_PHOTO.test(r)));
  const level = check.level === 'likely_fake' || (photoContact && check.level === 'caution') ? 'high'
    : check.level === 'caution' || photoContact ? 'medium' : 'low';
  const reasons = [
    ...check.flags,
    ...check.contradictions.filter((c) => c.severity >= 3).map((c) => `${c.topic}: your profile says two different things`),
    ...(photoContact ? ['A photo shows contact details or a QR code'] : []),
  ];
  return { level, reasons };
}

/** Re-run the self-check and set the status. Deliver kept likes when the profile becomes active. → status */
export async function settleStatus(userId) {
  const profile = await Profile.findOne({ userId }).lean();
  if (!profile?.status) return profile ? 'active' : null;
  const { level, reasons } = await selfCheck(profile);
  const releasedVersion = profile.selfCheck?.releasedVersion;
  const released = releasedVersion && releasedVersion === profileVersion(profile);
  const live = profile.liveChecked || !env.LIVE_CHECK_ENABLED;
  const status = level === 'high' && !released ? 'held' : live ? 'active' : 'browse_only';
  await Profile.updateOne({ userId }, { $set: { status, selfCheck: { level, reasons, at: new Date(), releasedVersion } } });
  if (status === 'active' && profile.status !== 'active') await deliverLikes(userId);
  return status;
}

/** Admin release of a held profile: this profile version stays released until its public content changes. */
export async function releaseProfile(userId) {
  const profile = await Profile.findOne({ userId }).lean();
  if (!profile) return null;
  await Profile.updateOne({ userId }, { $set: { 'selfCheck.releasedVersion': profileVersion(profile), status: 'browse_only' } });
  return settleStatus(userId);
}

/** Mutual likes made while I wasn't active become matches now. */
export async function deliverLikes(userId) {
  const mine = await Like.distinct('toUserId', { fromUserId: userId, liked: true });
  const back = await Like.distinct('fromUserId', { fromUserId: { $in: mine }, toUserId: userId, liked: true });
  for (const other of back) await createMatch(userId, other); // null while the other side isn't active; theirs delivers it
}

/** `profileCheck` job: the trust check's cached model part, then (for gated profiles) the status. */
export async function profileCheckJob({ userId }) {
  const profile = await Profile.findOne({ userId }, { status: 1 }).lean();
  if (profile?.status) await settleStatus(userId); // the self-check fills the same cache
  else await precheckProfile({ userId });
}
