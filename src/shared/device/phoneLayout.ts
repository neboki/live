// A phone (or a tablet held like one): touch first, and no floating window, so the app
// shows its simple layout of big buttons. Computers, even with a touch screen, keep the
// full one: they can share a tab and float the captions.

/** True on a touch device that cannot open a floating window */
export function isPhoneLayout(canFloat: boolean): boolean {
  if (canFloat || typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
