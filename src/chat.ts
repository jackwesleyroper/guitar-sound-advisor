import readline from "readline";
import { type Inventory } from "./schema.js";
import { summariseInventory } from "./inventory.js";
import { buildSystemPrompt } from "./prompt.js";
import { callModelRaw, callModel, type Message } from "./model.js";

const MAX_HISTORY = 10; // keep last N user+assistant turns

interface ChatState {
  artist: string;
  song: string;
  history: Message[];
}

function printHelp(): void {
  console.log(`
Available commands:
  /set artist <name>   — Set the current artist
  /set song <name>     — Set the current song
  /reset               — Reset artist, song and conversation history
  /inventory           — Print a summary of your loaded inventory
  /help                — Show this help
  /exit                — Exit the chat
`);
}

/**
 * Trim history to the last MAX_HISTORY user/assistant turns (pairs),
 * always keeping the system message at index 0.
 */
function trimHistory(history: Message[]): Message[] {
  if (history.length <= MAX_HISTORY * 2) return history;
  return history.slice(history.length - MAX_HISTORY * 2);
}

/**
 * Format the adviser JSON output for display in chat mode.
 */
function formatOutput(raw: string): string {
  try {
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    const parsed = JSON.parse(stripped);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

/**
 * Start the interactive chat session.
 */
export async function startChat(inventory: Inventory): Promise<void> {
  const systemPrompt = buildSystemPrompt(inventory);

  const state: ChatState = {
    artist: "",
    song: "",
    history: [],
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("\n🎸 Guitar Sound Adviser — Chat Mode");
  console.log("────────────────────────────────────");
  console.log("Type your questions, or use slash commands. Type /help for help.");
  console.log("Tip: Start with /set artist <name> and /set song <name>\n");

  const ask = (): void => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        ask();
        return;
      }

      // ── Slash commands ────────────────────────────────────────────────────
      if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === "/exit") {
          console.log("Goodbye! 🎸");
          rl.close();
          return;
        }

        if (cmd === "/help") {
          printHelp();
          ask();
          return;
        }

        if (cmd === "/reset") {
          state.artist = "";
          state.song = "";
          state.history = [];
          console.log("✅ Reset. Artist, song and history cleared.\n");
          ask();
          return;
        }

        if (cmd === "/inventory") {
          console.log("\n" + summariseInventory(inventory) + "\n");
          ask();
          return;
        }

        if (cmd === "/set" && parts[1]?.toLowerCase() === "artist") {
          state.artist = parts.slice(2).join(" ");
          console.log(`✅ Artist set to: ${state.artist}\n`);
          ask();
          return;
        }

        if (cmd === "/set" && parts[1]?.toLowerCase() === "song") {
          state.song = parts.slice(2).join(" ");
          console.log(`✅ Song set to: ${state.song}\n`);
          ask();
          return;
        }

        console.log(`Unknown command: ${cmd}. Type /help for available commands.\n`);
        ask();
        return;
      }

      // ── Regular message ───────────────────────────────────────────────────
      // Enrich message with current artist/song context if set
      let userContent = trimmed;
      if (state.artist || state.song) {
        const context: string[] = [];
        if (state.artist) context.push(`Artist: ${state.artist}`);
        if (state.song) context.push(`Song: ${state.song}`);
        userContent = `${context.join(", ")}\n\n${trimmed}`;
      }

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        ...trimHistory(state.history),
        { role: "user", content: userContent },
      ];

      process.stdout.write("\nAdviser: ");

      try {
        // Try structured output first; fall back to raw for follow-up questions
        let responseText: string;
        if (
          (state.artist || state.song) &&
          (trimmed.toLowerCase().includes("advise") ||
            trimmed.toLowerCase().includes("recommend") ||
            trimmed.toLowerCase().includes("setup") ||
            trimmed.toLowerCase().includes("tone") ||
            trimmed.toLowerCase().includes("settings") ||
            trimmed.toLowerCase().includes("rig") ||
            trimmed.toLowerCase().includes("pedal") ||
            trimmed.toLowerCase().includes("what should"))
        ) {
          try {
            const output = await callModel(messages);
            responseText = JSON.stringify(output, null, 2);
          } catch {
            // Fall through to raw response for conversational follow-ups
            responseText = await callModelRaw(messages);
          }
        } else {
          responseText = await callModelRaw(messages);
        }

        console.log(formatOutput(responseText));
        console.log();

        // Update history
        state.history.push({ role: "user", content: userContent });
        state.history.push({ role: "assistant", content: responseText });
      } catch (err) {
        console.error(`\n❌ Error: ${String(err)}\n`);
      }

      ask();
    });
  };

  ask();
}
