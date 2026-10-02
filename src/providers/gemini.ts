import { GoogleGenAI } from "@google/genai";

import type {
  ContentBlock,
  Message,
  Provider,
  StopReason,
  StreamOptions,
} from "../types.ts";

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

      try {
        const stream = await client.models.generateContentStream({
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
      } catch (error) {
        throw new Error(
          `Gemini streaming failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          {
            cause: error,
          },
        );
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
    },
  };
}