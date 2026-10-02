import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { getProvider } from "./providers/index.ts";
import type { AssistantMessage, Message } from "./types.ts";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const provider = getProvider("gemini");

const messages: Message[] = [];

function printWelcome() {
  console.log();
  console.log("Ceryn");
  console.log("An agentic coding CLI for your terminal.");
  console.log();
  console.log(`Provider: ${provider.name}`);
  console.log(`Model: ${provider.defaultModel}`);
  console.log();
  console.log("Commands:");
  console.log("  /help   Show available commands");
  console.log("  /clear  Clear conversation history");
  console.log("  /exit   Exit Ceryn");
  console.log();
}

function printHelp() {
  console.log();
  console.log("Commands:");
  console.log("  /help   Show available commands");
  console.log("  /clear  Clear conversation history");
  console.log("  /exit   Exit Ceryn");
  console.log();
}

async function runTurn(prompt: string) {
  const userMessage: Message = {
    role: "user",
    content: prompt,
  };

  messages.push(userMessage);

  let assistantMessage: AssistantMessage | undefined;
  let startedResponse = false;

  try {
    for await (
      const event of provider.stream({
        messages,
        model: provider.defaultModel,
      })
    ) {
      if (event.type === "text_delta") {
        if (!startedResponse) {
          process.stdout.write("\nCeryn > ");
          startedResponse = true;
        }

        process.stdout.write(event.delta);
      }

      if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      throw new Error("Provider returned no assistant message");
    }

    messages.push(assistantMessage);

    console.log();
    console.log();
  } catch (error) {
    if (startedResponse) {
      console.log();
    }

    console.error(
      `\nCeryn error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    messages.pop();

    console.log();
  }
}

async function main() {
  printWelcome();

  const rl = createInterface({
    input,
    output,
    terminal: true,
  });

  try {
    while (true) {
      const prompt = (await rl.question("You > ")).trim();

      if (!prompt) {
        continue;
      }

      if (prompt === "/exit" || prompt === "/quit") {
        console.log("\nGoodbye.\n");
        break;
      }

      if (prompt === "/help") {
        printHelp();
        continue;
      }

      if (prompt === "/clear") {
        messages.length = 0;
        console.log("\nConversation history cleared.\n");
        continue;
      }

      await runTurn(prompt);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(
    "\nCeryn error:",
    error instanceof Error ? error.message : String(error),
  );

  process.exit(1);
});