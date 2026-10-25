/** Server-side acceptance boundary: submissions are valid up to deadline + grace. `nowMs` must be the server clock. */
export function isWithinWindow(nowMs: number, deadlineMs: number, graceMs: number): boolean {
  return nowMs <= deadlineMs + graceMs;
}
