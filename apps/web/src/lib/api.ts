export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

export async function apiHealth(): Promise<{ status: string }> {
  const res = await fetch(`${getApiBaseUrl()}/healthz`);
  if (!res.ok) throw new Error(`healthz ${res.status}`);
  return (await res.json()) as { status: string };
}
