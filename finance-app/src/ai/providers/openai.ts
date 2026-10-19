import OpenAI from 'openai';
import type { Response, ResponseInputItem, Tool } from 'openai/resources/responses/responses';
import {
  AIError,
  type AgentRequest,
  type AgentResult,
  type AIProvider,
  type JsonRequest,
  type ModelTier,
} from '../types';

export interface OpenAIProviderOptions {
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new AIError('auth', error.message, { cause: error });
  }
  if (error instanceof OpenAI.RateLimitError) return new AIError('rate_limit', error.message, { cause: error });
  if (error instanceof OpenAI.APIConnectionError) return new AIError('network', error.message, { cause: error });
  if (error instanceof OpenAI.APIError) return new AIError('other', error.message, { cause: error });
  return new AIError('other', error instanceof Error ? error.message : String(error), { cause: error });
}

function assertNotRefused(response: Response) {
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    const refusal = item.content.find((c) => c.type === 'refusal');
    if (refusal && refusal.type === 'refusal') throw new AIError('refusal', refusal.refusal);
  }
}

/** ChatGPT models through the official OpenAI SDK (Responses API), with the user's own key. */
export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      // Personal phase only; see the note in the Claude provider.
      dangerouslyAllowBrowser: true,
      fetch: options.fetch,
    });
  }

  async generateJson<T>(request: JsonRequest): Promise<T> {
    let response: Response;
    try {
      response = await this.client.responses.create({
        model: this.options.models[request.tier],
        instructions: request.system,
        input: request.prompt,
        text: { format: { type: 'json_schema', name: request.schemaName, schema: request.schema, strict: true } },
      });
    } catch (error) {
      throw toAIError(error);
    }
    assertNotRefused(response);
    try {
      return JSON.parse(response.output_text) as T;
    } catch (error) {
      throw new AIError('invalid_output', 'Resposta da IA não é um JSON válido.', { cause: error });
    }
  }

  async runAgent(request: AgentRequest): Promise<AgentResult> {
    const tools: Tool[] = request.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }));
    if (request.webSearch) tools.push({ type: 'web_search' });

    const result: AgentResult = { text: '', toolCalls: [], sources: [] };
    const toolsByName = new Map(request.tools.map((tool) => [tool.name, tool]));
    const maxSteps = request.maxSteps ?? 8;

    let input: ResponseInputItem[] = request.history.map((turn) => ({ role: turn.role, content: turn.text }));
    let previousResponseId: string | undefined;

    for (let step = 0; step < maxSteps; step++) {
      let response: Response;
      try {
        response = await this.client.responses.create({
          model: this.options.models.smart,
          instructions: request.system,
          input,
          tools,
          previous_response_id: previousResponseId,
        });
      } catch (error) {
        throw toAIError(error);
      }
      assertNotRefused(response);
      collectSources(response, result);

      const calls = response.output.filter((item) => item.type === 'function_call');
      if (calls.length === 0) {
        result.text = response.output_text.trim();
        return result;
      }

      // Continue the same server-side conversation, sending only the tool outputs.
      previousResponseId = response.id;
      input = await Promise.all(
        calls.map(async (call): Promise<ResponseInputItem> => {
          let parsed: unknown;
          let output: string;
          try {
            parsed = JSON.parse(call.arguments);
            result.toolCalls.push({ name: call.name, input: parsed });
            request.onToolCall?.(call.name, parsed);
            const tool = toolsByName.get(call.name);
            if (!tool) throw new Error(`Ferramenta desconhecida: ${call.name}`);
            output = JSON.stringify(await tool.run(parsed));
          } catch (error) {
            output = JSON.stringify({ erro: error instanceof Error ? error.message : String(error) });
          }
          return { type: 'function_call_output', call_id: call.call_id, output };
        })
      );
    }
    throw new AIError('other', 'A IA precisou de passos demais para responder. Tente uma pergunta mais específica.');
  }
}

function collectSources(response: Response, result: AgentResult) {
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type !== 'output_text') continue;
      for (const annotation of content.annotations) {
        if (annotation.type === 'url_citation' && !result.sources.some((s) => s.url === annotation.url)) {
          result.sources.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
  }
}
