import { GoogleGenAI } from "@google/genai";

import type {
  ContentBlock,
  Message,
  Provider,
  StopReason,
  StreamOptions,
} from "../types.ts";

const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = error as {
    status?: unknown;
    code?: unknown;
    error?: {
      status?: unknown;
      code?: unknown;
    };
  };

  const candidates = [
    value.status,
    value.code,
    value.error?.status,
    value.error?.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      return candidate;
    }

    if (typeof candidate === "string") {
      const match = candidate.match(/\b(4\d{2}|5\d{2})\b/);

      if (match) {
        return Number(match[1]);
      }
    }
  }

  const message =
    error instanceof Error ? error.message : String(error);

  const match = message.match(/\b(4\d{2}|5\d{2})\b/);

  return match ? Number(match[1]) : undefined;
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (status === undefined) {
    return false;
  }

  return (
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function getRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** attempt,
    MAX_RETRY_DELAY_MS,
  );

  const jitter = Math.floor(Math.random() * 500);

  return exponentialDelay + jitter;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toGemini(messages: Message[]) {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        parts: [{ text: message.content }],
      };
    }

    if (message.role === "assistant") {
      return {
        role: "model",
        parts: message.content.map((block) => {
          if (block.type === "text") {
            return { text: block.text };
          }

          throw new Error(
            "Gemini tool-call messages are not supported yet",
          );
        }),
      };
    }

    throw new Error(
      "Gemini tool-result messages are not supported yet",
    );
  });
}

function getStopReason(
  finishReason: string | undefined,
): StopReason {
  switch (finishReason) {
    case "MAX_TOKENS":
      return "length";

    case "STOP":
    default:
      return "stop";
  }
}

export function createGemini(): Provider {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const client = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",
    defaultModel: "gemini-3.8-flash",

    async *stream({
      messages,
      model,
      system,
    }: StreamOptions) {
      const contents = toGemini(messages);

      let text = "";
      let finishReason: string | undefined;
      let inputTokens = 0;
      let outputTokens = 0;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const stream =
            await client.models.generateContentStream({
              model,
              contents,
              config: system
                ? {
                    systemInstruction: system,
                  }
                : undefined,
            });

          for await (const chunk of stream) {
            const delta = chunk.text;

            if (delta) {
              text += delta;

              yield {
                type: "text_delta",
                delta,
              };
            }

            const candidate = chunk.candidates?.[0];

            if (candidate?.finishReason) {
              finishReason = candidate.finishReason;
            }

            if (chunk.usageMetadata) {
              inputTokens =
                chunk.usageMetadata.promptTokenCount ??
                inputTokens;

              outputTokens =
                chunk.usageMetadata.candidatesTokenCount ??
                outputTokens;
            }
          }

          const content: ContentBlock[] = text
            ? [{ type: "text", text }]
            : [];

          yield {
            type: "done",
            message: {
              role: "assistant",
              content,
              usage: {
                input: inputTokens,
                output: outputTokens,
              },
              stopReason: getStopReason(finishReason),
            },
          };

          return;
        } catch (error) {
          const retryable = isRetryableError(error);
          const hasRetriesLeft = attempt < MAX_RETRIES;

          if (!retryable || !hasRetriesLeft) {
            throw new Error(
              `Gemini request failed: ${getErrorMessage(error)}`,
              {
                cause: error,
              },
            );
          }

          const delay = getRetryDelay(attempt);
          const seconds = (delay / 1000).toFixed(1);

          console.error(
            `\nGemini temporarily unavailable. Retrying ${
              attempt + 1
            }/${MAX_RETRIES} in ${seconds}s...`,
          );

          await sleep(delay);
        }
      }
    },
  };
}