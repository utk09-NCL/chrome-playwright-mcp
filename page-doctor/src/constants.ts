export const DEFAULT_AI_PROVIDER = 'gemini' as const;

export type AiProvider =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'lmstudio'
  | 'local'
  | 'ollama'
  | 'custom';

export type ThrottlePresetName = 'none' | 'mobile' | 'slow-3g' | 'desktop';

export interface ThrottlePreset {
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
  cpuSlowdown: number;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  lmstudio: 'local-model',
  local: 'local-model',
  ollama: 'qwen2.5:latest',
  custom: 'gpt-4o-mini'
};

export const THROTTLE_PRESETS: Record<ThrottlePresetName, ThrottlePreset | null> = {
  none: null,
  mobile: {
    downloadKbps: 1638.4,
    uploadKbps: 750,
    latencyMs: 150,
    cpuSlowdown: 4
  },
  'slow-3g': {
    downloadKbps: 400,
    uploadKbps: 400,
    latencyMs: 2000,
    cpuSlowdown: 4
  },
  desktop: {
    downloadKbps: 10240,
    uploadKbps: 10240,
    latencyMs: 40,
    cpuSlowdown: 1
  }
};

export function normalizeAiProvider(value: string | undefined): AiProvider {
  const normalized = (value ?? DEFAULT_AI_PROVIDER).toLowerCase();

  if (normalized in DEFAULT_MODELS) {
    return normalized as AiProvider;
  }

  return DEFAULT_AI_PROVIDER;
}
