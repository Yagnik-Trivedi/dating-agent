// Plan 32 KP1: where a reply is typed. A desktop keyboard makes people type plainer (no emoji, one long message), so
// the server counts desktop replies less for emoji, length and bursts. Touch + a phone-sized screen, not the user agent.
export function typingDevice() {
  try {
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    return touch && Math.min(window.screen.width, window.screen.height) < 820 ? 'mobile' : 'desktop'
  } catch { return 'desktop' }
}

/** The emoji picker shortcut for this computer. */
export const emojiShortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Cmd + Ctrl + Space' : 'Win + .')
