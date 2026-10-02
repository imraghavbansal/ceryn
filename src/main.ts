import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function main() {
  const prompt = "Explain quantum computing in simple terms.";

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });

  console.log(response.text);
}

main().catch(console.error);