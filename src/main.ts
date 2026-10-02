import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { getProvider } from "./providers/index.ts";
import type { Message } from "./types.ts";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();

  if (!prompt) {
    console.error("Usage: ceryn <prompt>");
    process.exit(1);
  }

  const provider = getProvider("gemini");

  const messages: Message[] = [
    {
      role: "user",
      content: prompt,
    },
  ];

  for await (
    const event of provider.stream({
      messages,
      model: provider.defaultModel,
    })
  ) {
    if (event.type === "text_delta") {
      process.stdout.write(event.delta);
    }

    if (event.type === "done") {
      console.log("\n\n---");
      console.log("Provider:", provider.name);
      console.log("Usage:", event.message.usage);
      console.log("Stop reason:", event.message.stopReason);
    }
  }
}

main().catch((error) => {
  console.error("\nCeryn error:", error);
  process.exit(1);
});