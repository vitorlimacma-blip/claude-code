import { OpenAIProvider } from '../providers/openai';
import type { LocalTool } from '../types';
import { scriptedFetch } from '../../test-utils/fakeFetch';

const models = { fast: 'gpt-5.4-mini', smart: 'gpt-5.5' };

function response(id: string, output: unknown[]) {
  return { id, object: 'response', created_at: 0, model: 'gpt-5.5', status: 'completed', output };
}

function textMessage(text: string, annotations: unknown[] = []) {
  return {
    type: 'message',
    id: 'msg',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations }],
  };
}

const echoTool: LocalTool = {
  name: 'saldo',
  description: 'Saldo',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  run: async () => ({ saldo: 'R$ 10,00' }),
};

describe('OpenAIProvider', () => {
  it('requests strict JSON schema output from the fast model', async () => {
    const { fetch, requests } = scriptedFetch([{ body: response('r1', [textMessage('{"ok":true}')]) }]);
    const provider = new OpenAIProvider({ apiKey: 'k', models, fetch });
    const out = await provider.generateJson({ tier: 'fast', system: 'sys', prompt: 'p', schemaName: 'cat', schema: { type: 'object' } });
    expect(out).toEqual({ ok: true });
    expect(requests[0].url).toContain('/responses');
    expect(requests[0].body).toMatchObject({
      model: 'gpt-5.4-mini',
      instructions: 'sys',
      input: 'p',
      text: { format: { type: 'json_schema', name: 'cat', strict: true } },
    });
  });

  it('runs function calls and continues the conversation with their outputs', async () => {
    const { fetch, requests } = scriptedFetch([
      { body: response('r1', [{ type: 'function_call', id: 'fc', call_id: 'call_1', name: 'saldo', arguments: '{}' }]) },
      {
        body: response('r2', [
          textMessage('Seu saldo é R$ 10,00.', [{ type: 'url_citation', title: 'Fonte', url: 'https://x.com', start_index: 0, end_index: 1 }]),
        ]),
      },
    ]);
    const provider = new OpenAIProvider({ apiKey: 'k', models, fetch });
    const result = await provider.runAgent({
      system: 'sys',
      history: [{ role: 'user', text: 'saldo?' }],
      tools: [echoTool],
      webSearch: true,
    });

    expect(result.text).toBe('Seu saldo é R$ 10,00.');
    expect(result.toolCalls).toEqual([{ name: 'saldo', input: {} }]);
    expect(result.sources).toEqual([{ title: 'Fonte', url: 'https://x.com' }]);
    expect(requests[0].body.tools).toEqual([
      expect.objectContaining({ type: 'function', name: 'saldo', strict: true }),
      { type: 'web_search' },
    ]);
    expect(requests[1].body).toMatchObject({
      previous_response_id: 'r1',
      input: [{ type: 'function_call_output', call_id: 'call_1', output: '{"saldo":"R$ 10,00"}' }],
    });
  });

  it('maps a refusal to an AIError', async () => {
    const { fetch } = scriptedFetch([
      {
        body: response('r1', [
          { type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'não posso' }] },
        ]),
      },
    ]);
    const provider = new OpenAIProvider({ apiKey: 'k', models, fetch });
    await expect(
      provider.generateJson({ tier: 'fast', system: '', prompt: '', schemaName: 's', schema: {} })
    ).rejects.toMatchObject({ kind: 'refusal' });
  });
});
