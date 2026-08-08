import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MODELS, normalizeAiProvider, type AiProvider } from './constants.js';

type AIRequestOptions = {
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  retries?: number;
};

type GeminiPart = { type?: string; text?: string };
type GeminiStep = { type?: string; content?: GeminiPart[] };
type GeminiInteraction = { output_text?: string; steps?: GeminiStep[]; status?: string };
type ErrorWithStatus = Error & { status?: number; code?: string };

/**
 * Shared AI helper for routing prompts to the configured provider.
 * Supports Gemini by default and OpenAI-compatible backends such as OpenAI, LM Studio, Ollama, and custom endpoints.
 */
const AI_PROVIDER: AiProvider = normalizeAiProvider(process.env.AI_PROVIDER);

/**
 * Resolve the model name for the current provider.
 */
function getModelName(): string {
  if (process.env.MODEL) return process.env.MODEL;
  return DEFAULT_MODELS[AI_PROVIDER] ?? 'gpt-4o-mini';
}

/**
 * Create an OpenAI-compatible client for the selected AI provider.
 */
function createOpenAIClient(): OpenAI {
  switch (AI_PROVIDER) {
    case 'openai':
      return new OpenAI({ apiKey: requireKey('OPENAI_API_KEY') });

    case 'lmstudio':
    case 'local':
      return new OpenAI({
        apiKey: 'lm-studio',
        baseURL: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1'
      });

    case 'ollama':
      return new OpenAI({
        apiKey: 'ollama',
        baseURL: process.env.OLLAMA_URL || 'http://localhost:11434/v1'
      });

    default:
      return new OpenAI({
        apiKey: process.env.CUSTOM_API_KEY || 'not-needed',
        baseURL: process.env.CUSTOM_BASE_URL
      });
  }
}

/**
 * Create a Gemini client for the selected AI provider.
 */
function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: requireKey('GEMINI_API_KEY') });
}

/**
 * Ensure that a required environment variable exists.
 */
function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(`Missing ${name}. Add it to your .env file (copy .env.example to .env).`);
  }
  return key;
}

let openAIClient: OpenAI | null = null;

/**
 * Lazily create and cache the OpenAI-compatible client.
 */
function getOpenAIClient(): OpenAI {
  if (!openAIClient) openAIClient = createOpenAIClient();
  return openAIClient;
}

/**
 * Extract readable text from a Gemini interaction payload.
 */
function extractInteractionText(interaction: GeminiInteraction): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text;
  }

  const chunks: string[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const part of step.content ?? []) {
      if (part.type === 'text' && part.text) chunks.push(part.text);
    }
  }
  return chunks.join('');
}

/**
 * Send a prompt to the Gemini SDK and return the generated text.
 */
async function askGemini(
  systemPrompt: string,
  userPrompt: string,
  { schema, temperature, maxOutputTokens }: Pick<AIRequestOptions, 'schema' | 'temperature' | 'maxOutputTokens'>
): Promise<string> {
  const client = createGeminiClient();

  const interaction = await client.interactions.create({
    model: getModelName(),
    system_instruction: systemPrompt,
    input: userPrompt,
    generation_config: {
      max_output_tokens: maxOutputTokens,
      ...(temperature !== undefined ? { temperature } : {})
    },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: schema ?? undefined
    }
  });

  const text = extractInteractionText(interaction as GeminiInteraction);

  if (!text) {
    throw new Error(
      `Gemini returned no text. Try raising max_output_tokens or simplifying the prompt.`
    );
  }

  return text;
}

/**
 * Send a prompt to an OpenAI-compatible API endpoint.
 */
async function askOpenAICompatible(
  systemPrompt: string,
  userPrompt: string,
  { temperature, maxOutputTokens }: Pick<AIRequestOptions, 'temperature' | 'maxOutputTokens'>
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const response = await getOpenAIClient().chat.completions.create({
    model: getModelName(),
    messages,
    temperature,
    ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {})
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map(part => (typeof part === 'string' ? part : ''))
      .join('');
    if (text.trim()) return text;
  }
  throw new Error('Model returned an empty response');
}

/**
 * Send a prompt to the configured AI provider with built-in retry handling.
 */
export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  options: AIRequestOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxOutputTokens, schema, retries = 2 } = options;

  const modelName = getModelName();
  console.log(`Asking AI (${AI_PROVIDER} - ${modelName})...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (AI_PROVIDER === 'gemini') {
        return await askGemini(systemPrompt, userPrompt, {
          schema,
          temperature,
          maxOutputTokens
        });
      }
      return await askOpenAICompatible(systemPrompt, userPrompt, {
        temperature,
        maxOutputTokens
      });
    } catch (error: unknown) {
      const status = getErrorStatus(error);
      const retryable = status === 429 || (typeof status === 'number' && status >= 500);

      if (retryable && attempt < retries) {
        const waitMs = 2000 * 2 ** attempt;
        console.log(`⏳ ${status === 429 ? 'Rate limited' : 'Server busy'}, retrying in ${waitMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      explainError(error);
      throw error;
    }
  }

  throw new Error('AI request failed without a response');
}

/**
 * Print a short, human-friendly explanation for common AI errors.
 */
function explainError(error: unknown): void {
  const message = getErrorMessage(error);
  console.error('AI Error:', message);

  const status = getErrorStatus(error);
  const code = getErrorCode(error);

  if (status === 400 && /API key not valid/i.test(message)) {
    console.error('\nYour API key was rejected. Get a fresh one at https://aistudio.google.com/apikey');
  } else if (status === 401 || status === 403) {
    console.error('\nCheck the API key in your .env file.');
  } else if (status === 404) {
    console.error(
      `\nThe model "${getModelName()}" is unavailable. Set MODEL in .env to a current model, e.g.:\n` +
        `   MODEL=${DEFAULT_MODELS.gemini}`
    );
  } else if (status === 429) {
    console.error('\nRate limit reached. Wait a minute, or switch to a cheaper model.');
  } else if (code === 'ECONNREFUSED') {
    console.error('\nLocal AI server not reachable. Is LM Studio / Ollama running?');
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as ErrorWithStatus).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as ErrorWithStatus).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Run a quick self-check by sending a tiny prompt to the configured AI provider.
 */
export async function testAI(): Promise<boolean> {
  console.log('\nTesting AI connection...\n');

  try {
    const response = await askAI(
      'You are a helpful assistant helping users debug their code using the chrome mcp library and playwright.',
      "What is the best way to use the chrome mcp library with playwright to debug a web page? Be brief and concise in your answer, don't provide code examples, and don't include any extra information. Just provide a short answer to the question."
    );

    console.log('\nAI Response:', response);
    console.log('\nAI connection successful!\n');
    return true;
  } catch {
    console.log('\nAI connection failed. Fix the error above, then try again.\n');
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await testAI();
  process.exit(ok ? 0 : 1);
}
