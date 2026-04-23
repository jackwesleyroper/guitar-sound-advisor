#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { loadInventory, summariseInventory } from "./inventory.js";
import { buildSystemPrompt, buildAdviseMessage } from "./prompt.js";
import { callModel, getDryRunInfo, type Message } from "./model.js";
import { startChat } from "./chat.js";

const program = new Command();

program
  .name("tone")
  .description("Guitar Sound Adviser — get tone recommendations from your inventory")
  .version("1.0.0");

// ─── tone advise ─────────────────────────────────────────────────────────────

program
  .command("advise")
  .description("Get a one-shot tone recommendation for an artist and song")
  .requiredOption("-a, --artist <artist>", "Artist name")
  .requiredOption("-s, --song <song>", "Song title")
  .option("--dry-run", "Print the composed prompt without calling the model")
  .action(async (options: { artist: string; song: string; dryRun?: boolean }) => {
    try {
      const inventory = loadInventory();
      const systemPrompt = buildSystemPrompt(inventory);
      const userMessage = buildAdviseMessage(options.artist, options.song);

      if (options.dryRun) {
        const info = getDryRunInfo();
        console.log("=== DRY RUN ===");
        console.log(`Model: ${info.model}`);
        if (info.baseUrl) console.log(`Base URL: ${info.baseUrl}`);
        console.log("\n=== SYSTEM PROMPT ===");
        console.log(systemPrompt);
        console.log("\n=== USER MESSAGE ===");
        console.log(userMessage);
        return;
      }

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ];

      console.log(`🎸 Analysing tone for: ${options.artist} — "${options.song}" ...`);
      const output = await callModel(messages);
      console.log(JSON.stringify(output, null, 2));
    } catch (err) {
      console.error(`❌ Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── tone chat ────────────────────────────────────────────────────────────────

program
  .command("chat")
  .description("Start an interactive chat session with the adviser")
  .action(async () => {
    try {
      const inventory = loadInventory();
      await startChat(inventory);
    } catch (err) {
      console.error(`❌ Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── tone inventory ───────────────────────────────────────────────────────────

const inventoryCmd = program
  .command("inventory")
  .description("Manage and inspect your inventory");

inventoryCmd
  .command("validate")
  .description("Validate the inventory.yml file")
  .action(() => {
    try {
      const inventory = loadInventory();
      console.log("✅ inventory.yml is valid.");
      console.log(summariseInventory(inventory));
      process.exit(0);
    } catch (err) {
      console.error(`❌ ${String(err)}`);
      process.exit(1);
    }
  });

// ─── tone web ─────────────────────────────────────────────────────────────────

program
  .command("web")
  .description("Start the inventory web UI")
  .option("-p, --port <number>", "Port to listen on", "3000")
  .action(async (options: { port: string }) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`❌ Invalid port: "${options.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }
    const { startWebServer } = await import("./web.js");
    startWebServer(port);
  });

program.parse(process.argv);
