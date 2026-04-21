import yaml from "js-yaml";
import { type Inventory } from "./schema.js";

/**
 * Build the system prompt that instructs the model to act as a guitar tone adviser.
 */
export function buildSystemPrompt(inventory: Inventory): string {
  const inventoryYaml = yaml.dump(inventory, { lineWidth: 120 });

  return `You are an expert guitar tone adviser. Your job is to help guitarists achieve a specific tone by recommending the best combination of guitar, amplifier, and pedals from their personal inventory.

STRICT RULES — you MUST follow all of them:
1. You MUST only select guitars, amps, and pedals that have IDs present in the provided inventory below. Do NOT invent or suggest gear that is not in the inventory.
2. If the ideal piece of gear for a tone is not in the inventory, pick the closest available alternative and explain the trade-off.
3. You MUST return ONLY valid JSON — no markdown, no code blocks, no extra text before or after the JSON object.
4. All knob settings MUST use the scale 0–10 unless the control implies specific units (e.g. time_ms uses milliseconds).
5. Limit pedal_chain to at most ${inventory.constraints.max_pedals_in_chain} pedals.
6. confidence is a float between 0 and 1 representing how well the inventory can replicate the target tone.

OUTPUT JSON SCHEMA (return exactly this shape):
{
  "request": { "artist": "string", "song": "string" },
  "assumptions": ["string", ...],
  "rig": {
    "guitar": {
      "id": "string (must be in inventory)",
      "pickup_position": "string (optional)",
      "tone_knob": number (0-10, optional),
      "volume_knob": number (0-10, optional)
    },
    "amp": {
      "id": "string (must be in inventory)",
      "channel": "string (optional)",
      "settings": { "<control_name>": number or string, ... }
    },
    "pedal_chain": [
      { "id": "string (must be in inventory)", "on": boolean, "settings": { "<control_name>": number or string, ... } },
      ...
    ]
  },
  "how_to_dial_in": ["string", ...],
  "what_i_couldnt_match": ["string", ...],
  "confidence": number (0.0 to 1.0)
}

INVENTORY:
\`\`\`yaml
${inventoryYaml}\`\`\``;
}

/**
 * Build a user message for a one-shot advise request.
 */
export function buildAdviseMessage(artist: string, song: string): string {
  return `Please advise me on the best guitar tone setup for:
Artist: ${artist}
Song: ${song}

Use only the gear in my inventory. Return JSON only.`;
}

/**
 * Build a repair prompt when the model returns invalid JSON.
 */
export function buildRepairPrompt(badOutput: string, error: string): string {
  return `Your previous response was not valid JSON or did not match the required schema.
Error: ${error}

Previous response:
${badOutput}

Please respond with ONLY a valid JSON object that matches the required schema. No markdown, no code blocks.`;
}
