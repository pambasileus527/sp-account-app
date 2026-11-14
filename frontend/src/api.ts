export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : 'うまくいきませんでした。もう一度お試しください。';

/** /api への呼び出し。body があれば POST（JSON）。失敗したら、画面に出せるメッセージ入りの ApiError を投げる。 */
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (body !== undefined) {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('サーバーに繋がりません。しばらくしてからもう一度お試しください。', 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 本文なし */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new ApiError(message || 'うまくいきませんでした。もう一度お試しください。', res.status);
  }
  return data as T;
}
