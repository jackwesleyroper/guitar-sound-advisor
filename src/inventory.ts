import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { InventorySchema, type Inventory } from "./schema.js";

const INVENTORY_PATH = path.resolve(process.cwd(), "inventory.yml");

/**
 * Load and parse inventory.yml from the current working directory.
 * Throws a descriptive error if the file is missing or unparseable.
 */
export function loadInventoryRaw(): unknown {
  if (!fs.existsSync(INVENTORY_PATH)) {
    throw new Error(
      `inventory.yml not found at ${INVENTORY_PATH}\n` +
        `Please create it. See the README for the expected structure.`
    );
  }

  const raw = fs.readFileSync(INVENTORY_PATH, "utf8");
  try {
    return yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse inventory.yml as YAML: ${String(err)}`);
  }
}

/**
 * Load, parse and validate the inventory.
 * Returns a typed Inventory on success, or throws with friendly Zod error messages.
 */
export function loadInventory(): Inventory {
  const raw = loadInventoryRaw();
  const result = InventorySchema.safeParse(raw);

  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join(".")} — ${e.message}`)
      .join("\n");
    throw new Error(`inventory.yml validation failed:\n${messages}`);
  }

  return result.data;
}

/**
 * Return a compact summary of the inventory for display.
 */
export function summariseInventory(inv: Inventory): string {
  const guitars = inv.guitars.map((g) => `  - [${g.id}] ${g.name}`).join("\n");
  const amps = inv.amps.map((a) => `  - [${a.id}] ${a.name}`).join("\n");
  const pedals = inv.pedals.map((p) => `  - [${p.id}] ${p.name}`).join("\n");

  return [
    `Inventory v${inv.version}${inv.owner ? ` (owner: ${inv.owner})` : ""}`,
    `\nGuitars (${inv.guitars.length}):`,
    guitars,
    `\nAmps (${inv.amps.length}):`,
    amps,
    `\nPedals (${inv.pedals.length}):`,
    pedals,
    `\nConstraints:`,
    `  - Max pedals in chain: ${inv.constraints.max_pedals_in_chain}`,
    `  - Inventory-only selection: ${inv.constraints.must_choose_from_inventory_only}`,
  ].join("\n");
}
