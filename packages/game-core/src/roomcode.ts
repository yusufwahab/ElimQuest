export function formatRoomCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
export function normaliseRoomCode(input: string): string {
  return input.replace(/\D/g, '');
}
export function isValidRoomCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
