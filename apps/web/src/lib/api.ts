/** Thin fetch wrapper. Bearer = account (Supabase/dev JWT); X-Guest-Token = guest/participant/practice credential. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) || API_URL || undefined;

let tokenProvider: () => Promise<string | null> = async () => null;
export const setTokenProvider = (fn: () => Promise<string | null>) => { tokenProvider = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string, public details?: any, public issues?: { path: string; message: string }[]) { super(message); }
}

export interface ReqOpts { guest?: string; auth?: boolean; raw?: Blob | ArrayBuffer; filename?: string; headers?: Record<string, string>; signal?: AbortSignal }

export async function api<T = any>(method: string, path: string, body?: unknown, o: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = { ...o.headers };
  if (o.auth !== false) { const t = await tokenProvider(); if (t) headers.authorization = `Bearer ${t}`; }
  if (o.guest) headers['x-guest-token'] = o.guest;
  let payload: BodyInit | undefined;
  if (o.raw) { payload = o.raw as BodyInit; headers['content-type'] = 'application/octet-stream'; if (o.filename) headers['x-filename'] = o.filename; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  let res: Response;
  try { res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: o.signal }); }
  catch { throw new ApiError(0, 'Cannot reach the server. It may be waking up — please try again in a moment.', 'network'); }
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code ?? 'error', data?.details, data?.issues);
  return data as T;
}

export async function download(path: string, filename: string, mime = 'text/plain') {
  const t = await tokenProvider();
  const res = await fetch(`${API_URL}${path}`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Download failed', 'download');
  const blob = new Blob([await res.arrayBuffer()], { type: mime });
  saveBlob(blob, filename);
}
export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Friendly message for forms and toasts. */
export const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong');
