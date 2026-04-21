import { GoogleGenerativeAI } from "@google/generative-ai";
import { AdviserOutputSchema, type AdviserOutput } from "./schema.js";
import { buildRepairPrompt } from "./prompt.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set.\n" +
        "Set it in your shell or .env file, e.g.:\n" +
        "  GEMINI_API_KEY=...\n"
    );
  }

  return {
    apiKey,
    model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
  };
}

/**
 * Convert OpenAI-style messages into a single Gemini prompt.
 * We keep it simple: concatenate messages in order with role tags.
 */
function messagesToPrompt(messages: Message[]): string {
  return messages
    .map((m) => {
      const tag =
        m.role === "system" ? "SYSTEM" : m.role === "assistant" ? "ASSISTANT" : "USER";
      return `[${tag}]\n${m.content}`;
    })
    .join("\n\n");
}

/**
 * Send messages to Gemini and return the raw text response.
 */
async function rawCompletion(config: GeminiConfig, messages: Message[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey);

  // Ask Gemini to output JSON; still validate strictly ourselves.
  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig: {
      temperature: 0.3,
      // Supported by many Gemini models; if ignored, we still parse/validate.
      responseMimeType: "application/json" as unknown as string,
    },
  });

  const prompt = messagesToPrompt(messages);
  const result = await model.generateContent(prompt);

  const content = result.response.text();
  if (!content) {
    throw new Error("Model returned an empty response.");
  }
  return content;
}

/**
 * Parse and validate the model output against the AdviserOutputSchema.
 * Strips markdown code fences if the model wraps the JSON.
 */
function parseOutput(raw: string): AdviserOutput {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`Response is not valid JSON: ${stripped.slice(0, 200)}`);
  }

  const result = AdviserOutputSchema.safeParse(parsed);
  if (!result.success) {
    const msgs = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Response does not match expected schema: ${msgs}`);
  }

  return result.data;
}

/**
 * Call Gemini with messages and return a validated AdviserOutput.
 * Retries once with a repair prompt if the initial response is invalid.
 */
export async function callModel(messages: Message[]): Promise<AdviserOutput> {
  const config = getGeminiConfig();

  const firstRaw = await rawCompletion(config, messages);

  try {
    return parseOutput(firstRaw);
  } catch (firstError) {
    const repairMessages: Message[] = [
      ...messages,
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content: buildRepairPrompt(firstRaw, String(firstError)),
      },
    ];

    const secondRaw = await rawCompletion(config, repairMessages);
    return parseOutput(secondRaw);
  }
}

/**
 * Send raw messages for chat follow-ups (returns raw string for flexibility).
 * Used in chat mode where responses may not always be in the AdviserOutput shape.
 */
export async function callModelRaw(messages: Message[]): Promise<string> {
  const config = getGeminiConfig();
  return rawCompletion(config, messages);
}

/**
 * Build prompt strings for --dry-run mode without calling the model.
 */
export function getDryRunInfo(): { model: string; baseUrl?: string } {
  // Gemini doesn’t use a baseUrl in this implementation, but index.ts expects it.
  return {
    model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
    baseUrl: undefined,
  };
}