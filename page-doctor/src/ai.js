import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { GoogleGenAI } from "@google/genai";

/**
 * Shared AI helper for routing prompts to the configured provider.
 * Supports Gemini by default and OpenAI-compatible backends such as OpenAI, LM Studio, Ollama, and custom endpoints.
 */
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

const DEFAULT_MODELS = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  lmstudio: 'local-model', // LM Studio serves whatever model you loaded
  local: 'local-model',
  ollama: 'qwen2.5:latest'
};

/**
 * Resolve the model name for the current provider.
 * @returns {string} The configured model identifier.
 */
function getModelName() {
  if (process.env.MODEL) return process.env.MODEL;
  return DEFAULT_MODELS[AI_PROVIDER] || 'gpt-4o-mini';
}

/**
 * Create an OpenAI-compatible client for the selected AI provider.
 * @returns {OpenAI} A configured client instance.
 */
function createOpenAIClient() {
  switch (AI_PROVIDER) {
    case 'openai':
      return new OpenAI({ apiKey: requireKey('OPENAI_API_KEY') });

    case 'lmstudio':
    case 'local':
      return new OpenAI({
        apiKey: 'lm-studio', // local servers ignore the key
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
 * @returns {GoogleGenAI} A configured Gemini client instance.
 */
function createGeminiClient() {
  return new GoogleGenAI({ apiKey: requireKey('GEMINI_API_KEY') });
}

/**
 * Ensure that a required environment variable exists.
 * @param {string} name - The environment variable name to check.
 * @returns {string} The resolved API key or endpoint value.
 */
function requireKey(name) {
  const key = process.env[name];
  if (!key) {
    throw new Error(`Missing ${name}. Add it to your .env file (copy .env.example to .env).`);
  }
  return key;
}

let openAIClient;

/**
 * Lazily create and cache the OpenAI-compatible client.
 * @returns {OpenAI} The cached client instance.
 */
function getOpenAIClient() {
  if (!openAIClient) openAIClient = createOpenAIClient();
  return openAIClient;
}

/**
 * Extract readable text from a Gemini interaction payload.
 * @param {object} interaction - The raw Gemini response object.
 * @returns {string} The combined text content from the interaction.
 */
function extractInteractionText(interaction) {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text;
  }

  const chunks = [];
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
 * @param {string} systemPrompt - Optional system instructions for the model.
 * @param {string} userPrompt - The user-facing prompt to answer.
 * @param {object} options - Request settings such as schema and token limits.
 * @returns {Promise<string>} The model response as plain text.
 */
async function askGemini(systemPrompt, userPrompt, { schema, temperature, maxOutputTokens }) {
  const client = createGeminiClient();

  const interaction = await client.interactions.create({
    model: getModelName(),
    system_instruction: systemPrompt,
    input: userPrompt,
    generation_config: {
      "temperature" : temperature,
      "max_output_tokens" : maxOutputTokens
    },
    response_format:{
      "type" : "text",
      "schema" : schema || undefined
    }
  });

  const text = extractInteractionText(interaction);

  if (!text) {
    throw new Error(
      `Gemini returned no text (status: ${data?.status ?? 'unknown'}). ` +
        `Try raising max_output_tokens or simplifying the prompt.`
    );
  }

  return text;
}

/**
 * Send a prompt to an OpenAI-compatible API endpoint.
 * @param {string} systemPrompt - Optional system instructions for the model.
 * @param {string} userPrompt - The user-facing prompt to answer.
 * @param {object} options - Request settings such as temperature and token limits.
 * @returns {Promise<string>} The model response as plain text.
 */
async function askOpenAICompatible(systemPrompt, userPrompt, { temperature, maxOutputTokens }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const response = await getOpenAIClient().chat.completions.create({
    model: getModelName(),
    messages,
    temperature,
    ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {})
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Model returned an empty response');
  return text;
}

/**
 * Send a prompt to the configured AI provider with built-in retry handling.
 * @param {string} systemPrompt - Optional system instructions.
 * @param {string} userPrompt - The prompt to send to the model.
 * @param {object} [options] - Optional settings such as temperature, token limits, schema, and retries.
 * @returns {Promise<string>} The final model response.
 */
export async function askAI(systemPrompt, userPrompt, options = {}) {
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
    } catch (error) {
      const retryable = error.status === 429 || error.status >= 500;

      if (retryable && attempt < retries) {
        const waitMs = 2000 * 2 ** attempt; // 2s, 4s
        console.log(
          `⏳ ${error.status === 429 ? 'Rate limited' : 'Server busy'}, retrying in ${waitMs / 1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      explainError(error);
      throw error;
    }
  }
}

/**
 * Print a short, human-friendly explanation for common AI errors.
 * @param {Error & {status?: number, code?: string}} error - The error to explain.
 */
function explainError(error) {
  console.error('AI Error:', error.message);

  if (error.status === 400 && /API key not valid/i.test(error.message)) {
    console.error(
      '\nYour API key was rejected. Get a fresh one at https://aistudio.google.com/apikey'
    );
  } else if (error.status === 401 || error.status === 403) {
    console.error('\nCheck the API key in your .env file.');
  } else if (error.status === 404) {
    console.error(
      `\nThe model "${getModelName()}" is unavailable. Set MODEL in .env to a current model, e.g.:\n` +
        `   MODEL=${DEFAULT_MODELS.gemini}`
    );
  } else if (error.status === 429) {
    console.error('\nRate limit reached. Wait a minute, or switch to a cheaper model.');
  } else if (error.code === 'ECONNREFUSED') {
    console.error('\nLocal AI server not reachable. Is LM Studio / Ollama running?');
  }
}

/**
 * Run a quick self-check by sending a tiny prompt to the configured AI provider.
 * @returns {Promise<boolean>} True when the connection succeeds, otherwise false.
 */
export async function testAI() {
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
