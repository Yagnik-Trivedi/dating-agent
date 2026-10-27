// UI polish B8: through the Vercel /api rewrite a response must start within ~120 s or the visitor gets a 504. Slow
// model work keeps running (and saving/caching its result) after we answer "still working".
/** → { done: true, value } when the promise settles within ms, else { done: false } (the promise keeps running). */
export async function within(promise, ms = 90_000) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ done: false }), ms); });
  promise.catch(() => {}); // a late failure is logged by its own caller; never an unhandled rejection
  try {
    return await Promise.race([promise.then((value) => ({ done: true, value })), late]);
  } finally {
    clearTimeout(timer);
  }
}
