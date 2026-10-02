import { Provider } from "../types.ts";
import { createAnthropic } from "./anthropic.ts";
import { createOpenAICompat } from "./openai-compat.ts";
import { createGemini } from "./gemini.ts";

const providers: Record<string, () => Provider> = {
  gemini: createGemini,

  anthropic: createAnthropic,

  "anthropic-openai": () =>
    createOpenAICompat(
      "anthropic-openai",
      "https://api.anthropic.com/v1/",
      process.env.ANTHROPIC_API_KEY!,
      "claude-sonnet-5",
    ),

  groq: () =>
    createOpenAICompat(
      "groq",
      "https://api.groq.com/openai/v1",
      process.env.GROQ_API_KEY!,
      "qwen/qwen3.8-27b",
    ),
};

export function getProvider(name: string): Provider {
  const create = providers[name];

  if (!create) {
    throw new Error(`Unknown provider: ${name}`);
  }

  return create();
}