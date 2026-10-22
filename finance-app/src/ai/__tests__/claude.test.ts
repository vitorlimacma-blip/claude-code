import { ClaudeProvider } from '../providers/claude';
import { AIError, type LocalTool } from '../types';
import { scriptedFetch } from '../../test-utils/fakeFetch';

const models = { fast: 'claude-haiku-5-5', smart: 'claude-opus-5-5' };

function message(content: unknown[], stop_reason = 'end_turn', extra: object = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...extra,
  };
}

const sumTool: LocalTool = {
  name: 'somar',
  description: 'Soma dois números',
  parameters: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
    additionalProperties: false,
  },
  run: async (input) => {
    const { a, b } = input as { a: number; b: number };
    return { total: a + b };
  },
};

describe('ClaudeProvider', () => {
  it('requests structured JSON from the fast model with fallback enabled', async () => {
    const { fetch, requests } = scriptedFetch([{ body: message([{ type: 'text', text: '{"categoryId":"x"}' }]) }]);
    const provider = new ClaudeProvider({ apiKey: 'k', models, fetch });

    const out = await provider.generateJson<{ categoryId: string }>({
      tier: 'fast',
      system: 'sys',
      prompt: 'p',
      schemaName: 's',
      schema: { type: 'object' },
    });

    expect(out).toEqual({ categoryId: 'x' });
    const req = requests[0];
    expect(req.url).toContain('/v1/messages');
    expect(req.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(req.headers['x-api-key']).toBe('k');
    expect(req.body).toMatchObject({
      model: 'claude-haiku-5-5',
      fallbacks: 'default',
      system: 'sys',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
    });
  });

  it('runs local tools and sends all results back before answering', async () => {
    const { fetch, requests } = scriptedFetch([
      {
        body: message(
          [
            { type: 'text', text: 'Vou somar.' },
            { type: 'tool_use', id: 'tu_1', name: 'somar', input: { a: 2, b: 3 } },
            { type: 'tool_use', id: 'tu_2', name: 'inexistente', input: {} },
          ],
          'tool_use'
        ),
      },
      { body: message([{ type: 'text', text: 'O total é 5.' }]) },
    ]);
    const provider = new ClaudeProvider({ apiKey: 'k', models, fetch });
    const calls: string[] = [];

    const result = await provider.runAgent({
      system: 'sys',
      history: [{ role: 'user', text: 'quanto é 2+3?' }],
      tools: [sumTool],
      webSearch: true,
      onToolCall: (name) => calls.push(name),
    });

    expect(result.text).toBe('O total é 5.');
    expect(calls).toEqual(['somar', 'inexistente']);
    expect(requests[0].body.model).toBe('claude-opus-5-5');
    expect(requests[0].body.tools).toEqual([
      expect.objectContaining({ name: 'somar', strict: true }),
      { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
    ]);
    const lastTurn = requests[1].body.messages.at(-1);
    expect(lastTurn.role).toBe('user');
    expect(lastTurn.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: '{"total":5}' },
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu_2', is_error: true }),
    ]);
  });

  it('collects web search sources and continues after pause_turn', async () => {
    const { fetch, requests } = scriptedFetch([
      {
        body: message(
          [
            { type: 'server_tool_use', id: 'st_1', name: 'web_search', input: { query: 'selic hoje' } },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'st_1',
              content: [{ type: 'web_search_result', title: 'BCB', url: 'https://bcb.gov.br', encrypted_content: 'x', page_age: null }],
            },
          ],
          'pause_turn'
        ),
      },
      { body: message([{ type: 'text', text: 'A Selic está em X%.' }]) },
    ]);
    const provider = new ClaudeProvider({ apiKey: 'k', models, fetch });
    const result = await provider.runAgent({ system: 's', history: [{ role: 'user', text: 'selic?' }], tools: [], webSearch: true });
    expect(result.sources).toEqual([{ title: 'BCB', url: 'https://bcb.gov.br' }]);
    expect(requests).toHaveLength(2);
    expect(requests[1].body.messages.at(-1).role).toBe('assistant');
  });

  it('maps refusals and auth failures to AIError kinds', async () => {
    const refused = scriptedFetch([
      { body: message([], 'refusal', { stop_details: { type: 'refusal', category: null, explanation: 'não' } }) },
    ]);
    await expect(
      new ClaudeProvider({ apiKey: 'k', models, fetch: refused.fetch }).generateJson({
        tier: 'fast', system: '', prompt: '', schemaName: 's', schema: {},
      })
    ).rejects.toMatchObject({ kind: 'refusal' });

    const unauthorized = scriptedFetch([
      { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } },
    ]);
    const error = await new ClaudeProvider({ apiKey: 'bad', models, fetch: unauthorized.fetch })
      .generateJson<never>({ tier: 'fast', system: '', prompt: '', schemaName: 's', schema: {} })
      .catch((e: unknown) => e as AIError);
    expect(error).toBeInstanceOf(AIError);
    expect(error.kind).toBe('auth');
  });
});
