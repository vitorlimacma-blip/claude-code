/** A scripted `fetch` that records each request body and replies with queued JSON responses. */
export function scriptedFetch(responses: { status?: number; body: unknown }[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    requests.push({ url: String(url), headers, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift();
    if (!next) throw new Error('No scripted response left');
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fetchFn, requests };
}
