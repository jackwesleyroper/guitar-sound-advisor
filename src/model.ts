import OpenAI from "openai";
import { AdviserOutputSchema, type AdviserOutput } from "./schema.js";
import { buildRepairPrompt } from "./prompt.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

function getModelConfig(): ModelConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set.\n" +
        "Set it with: export OPENAI_API_KEY=sk-..."
    );
  }
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
  };
}

function createClient(config: ModelConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
}

/**
 * Send messages to the model and return the raw text response.
 */
async function rawCompletion(
  client: OpenAI,
  model: string,
  messages: Message[]
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
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
  // Strip markdown code fences if present
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
 * Call the model with messages and return a validated AdviserOutput.
 * Retries once with a repair prompt if the initial response is invalid.
 */
export async function callModel(messages: Message[]): Promise<AdviserOutput> {
  const config = getModelConfig();
  const client = createClient(config);

  const firstRaw = await rawCompletion(client, config.model, messages);

  try {
    return parseOutput(firstRaw);
  } catch (firstError) {
    // Retry with a repair prompt
    const repairMessages: Message[] = [
      ...messages,
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content: buildRepairPrompt(firstRaw, String(firstError)),
      },
    ];

    const secondRaw = await rawCompletion(client, config.model, repairMessages);
    return parseOutput(secondRaw);
  }
}

/**
 * Send raw messages for chat follow-ups (returns raw string for flexibility).
 * Used in chat mode where responses may not always be in the AdviserOutput shape.
 */
export async function callModelRaw(messages: Message[]): Promise<string> {
  const config = getModelConfig();
  const client = createClient(config);
  return rawCompletion(client, config.model, messages);
}

/**
 * Build prompt strings for --dry-run mode without calling the model.
 */
export function getDryRunInfo(): { model: string; baseUrl?: string } {
  const apiKey = process.env.OPENAI_API_KEY ?? "(not set)";
  void apiKey; // intentionally not displayed to avoid leaking
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    baseUrl: process.env.OPENAI_BASE_URL,
  };
}
