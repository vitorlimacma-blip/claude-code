import Anthropic from '@anthropic-ai/sdk';
import {
  AIError,
  type AgentRequest,
  type AgentResult,
  type AIProvider,
  type JsonRequest,
  type ModelTier,
} from '../types';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolUnion = Anthropic.Beta.BetaToolUnion;
type Message = Anthropic.Beta.BetaMessage;

export interface ClaudeProviderOptions {
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIError('auth', error.message, { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) return new AIError('rate_limit', error.message, { cause: error });
  if (error instanceof Anthropic.APIConnectionError) return new AIError('network', error.message, { cause: error });
  if (error instanceof Anthropic.APIError) return new AIError('other', error.message, { cause: error });
  return new AIError('other', error instanceof Error ? error.message : String(error), { cause: error });
}

function assertNotRefused(response: Message) {
  if (response.stop_reason === 'refusal') {
    throw new AIError('refusal', response.stop_details?.explanation ?? 'Pedido recusado pelo modelo.');
  }
}

function textOf(response: Message): string {
  return response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim();
}

/** Claude through the official Anthropic SDK, called directly from the device with the user's own key. */
export class ClaudeProvider implements AIProvider {
  readonly id = 'claude' as const;
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeProviderOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      // Personal phase: the key belongs to the user and lives on their device. The
      // commercial version must route through a server instead (see docs/ARQUITETURA.md).
      dangerouslyAllowBrowser: true,
      fetch: options.fetch,
    });
  }

  /** Parameters shared by every request: model plus server-side fallback if the model declines. */
  private base(tier: ModelTier) {
    return {
      model: this.options.models[tier],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    };
  }

  async generateJson<T>(request: JsonRequest): Promise<T> {
    let response: Message;
    try {
      response = await this.client.beta.messages.create({
        ...this.base(request.tier),
        max_tokens: 2048,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: request.schema } },
      });
    } catch (error) {
      throw toAIError(error);
    }
    assertNotRefused(response);
    try {
      return JSON.parse(textOf(response)) as T;
    } catch (error) {
      throw new AIError('invalid_output', 'Resposta da IA não é um JSON válido.', { cause: error });
    }
  }

  async runAgent(request: AgentRequest): Promise<AgentResult> {
    const model = this.options.models.smart;
    const tools: ToolUnion[] = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));
    if (request.webSearch) {
      // The dynamic-filtering variant needs Opus/Sonnet; Haiku uses the basic one.
      tools.push(
        model.startsWith('claude-haiku')
          ? { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
          : { type: 'web_search_20260209', name: 'web_search', max_uses: 3 }
      );
    }

    const messages: MessageParam[] = request.history.map((turn) => ({ role: turn.role, content: turn.text }));
    const result: AgentResult = { text: '', toolCalls: [], sources: [] };
    const toolsByName = new Map(request.tools.map((tool) => [tool.name, tool]));
    const maxSteps = request.maxSteps ?? 8;

    for (let step = 0; step < maxSteps; step++) {
      let response: Message;
      try {
        response = await this.client.beta.messages.create({
          ...this.base('smart'),
          max_tokens: 16000,
          system: request.system,
          tools,
          messages,
          output_config: { effort: 'medium' },
        });
      } catch (error) {
        throw toAIError(error);
      }
      assertNotRefused(response);
      collectSources(response, result);

      // A server tool (web search) hit its per-turn limit: resend to let it continue.
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        result.text = textOf(response);
        return result;
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (use) => {
          result.toolCalls.push({ name: use.name, input: use.input });
          request.onToolCall?.(use.name, use.input);
          const tool = toolsByName.get(use.name);
          try {
            if (!tool) throw new Error(`Ferramenta desconhecida: ${use.name}`);
            const output = await tool.run(use.input);
            return { type: 'tool_result' as const, tool_use_id: use.id, content: JSON.stringify(output) };
          } catch (error) {
            return {
              type: 'tool_result' as const,
              tool_use_id: use.id,
              content: error instanceof Error ? error.message : String(error),
              is_error: true,
            };
          }
        })
      );
      // All results of one turn go back together, in a single user message.
      messages.push({ role: 'user', content: toolResults });
    }
    throw new AIError('other', 'A IA precisou de passos demais para responder. Tente uma pergunta mais específica.');
  }
}

function collectSources(response: Message, result: AgentResult) {
  for (const block of response.content) {
    // On error the content is an object, on success a list of results.
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (!result.sources.some((s) => s.url === item.url)) result.sources.push({ title: item.title, url: item.url });
      }
    }
  }
}
