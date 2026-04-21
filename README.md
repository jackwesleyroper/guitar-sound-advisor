# 🎸 Guitar Sound Adviser

Given an artist and a song, the **Guitar Sound Adviser** recommends the closest matching guitar, amp and pedals **from your own inventory** and suggests knob settings to get as close to the original tone as possible.

Text-only analysis powered by an LLM — no audio upload required.

---

## Features

- **`tone advise`** — One-shot tone recommendation for any artist + song.
- **`tone chat`** — Interactive chat session with rolling conversation history.
- **`tone inventory validate`** — Validate your `inventory.yml` file.
- **`--dry-run`** — Inspect the full composed prompt without calling the model.
- **Inventory-only selection** — The model is forced to choose only gear you own.
- **Strict JSON output** — Responses are validated against a schema; retried once on failure.

---

## Requirements

- Node.js ≥ 18
- An OpenAI API key (or compatible endpoint)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/jackwesleyroper/guitar-sound-advisor.git
cd guitar-sound-advisor
npm install
```

### 2. Configure environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ Yes | — | Your OpenAI API key (`sk-...`) |
| `OPENAI_MODEL` | No | `gpt-4o` | Model to use (e.g. `gpt-4o`, `gpt-4-turbo`) |
| `OPENAI_BASE_URL` | No | OpenAI default | Override for Azure OpenAI or other compatible endpoints |

```bash
export OPENAI_API_KEY=sk-...
# Optional:
export OPENAI_MODEL=gpt-4o
export OPENAI_BASE_URL=https://your-azure-endpoint.openai.azure.com/
```

### 3. Edit your inventory

Open `inventory.yml` and replace the sample gear with the guitars, amps and pedals you actually own. See [Inventory Format](#inventory-format) below.

### 4. Build and run

```bash
# Build TypeScript → dist/
npm run build

# Run a command
npm run start -- advise --artist "Jimi Hendrix" --song "Purple Haze"

# Or during development (no build step needed):
npm run dev -- advise --artist "Jimi Hendrix" --song "Purple Haze"
```

---

## Usage

### One-shot recommendation

```bash
node dist/index.js advise --artist "David Gilmour" --song "Comfortably Numb"
node dist/index.js advise --artist "John Mayer" --song "Slow Dancing in a Burning Room"
node dist/index.js advise --artist "Kurt Cobain" --song "Come as You Are"
```

Outputs a JSON object with the recommended rig and dial-in instructions.

### Dry run (inspect prompt without calling model)

```bash
node dist/index.js advise --artist "Jimi Hendrix" --song "Purple Haze" --dry-run
```

### Interactive chat

```bash
node dist/index.js chat
```

Inside the chat session:

| Command | Description |
|---|---|
| `/set artist <name>` | Set the current artist |
| `/set song <name>` | Set the current song |
| `/reset` | Clear artist, song and conversation history |
| `/inventory` | Print a summary of your loaded inventory |
| `/help` | Show available commands |
| `/exit` | Exit the chat |

**Example chat session:**
```
🎸 Guitar Sound Adviser — Chat Mode
────────────────────────────────────
You: /set artist The Edge
✅ Artist set to: The Edge

You: /set song Where The Streets Have No Name
✅ Song set to: Where The Streets Have No Name

You: What are the best tone settings for this song?
Adviser: { ... JSON rig recommendation ... }

You: Can you suggest an alternate rig with more distortion?
Adviser: { ... }

You: /exit
Goodbye! 🎸
```

### Validate inventory

```bash
node dist/index.js inventory validate
```

Exits with code `0` on success, `1` on failure with friendly error messages.

---

## Output Format

The adviser returns a JSON object like this:

```json
{
  "request": { "artist": "Jimi Hendrix", "song": "Purple Haze" },
  "assumptions": [
    "Using the Stratocaster as Hendrix's primary guitar.",
    "No octave fuzz in inventory; using Big Muff as closest alternative."
  ],
  "rig": {
    "guitar": {
      "id": "strat_sss",
      "pickup_position": "bridge",
      "tone_knob": 7,
      "volume_knob": 10
    },
    "amp": {
      "id": "marshall_plexi",
      "channel": "high_treble",
      "settings": {
        "volume_high_treble": 8,
        "treble": 7,
        "middle": 5,
        "bass": 4,
        "presence": 7
      }
    },
    "pedal_chain": [
      { "id": "tuner", "on": true, "settings": {} },
      { "id": "big_muff", "on": true, "settings": { "sustain": 7, "tone": 6, "volume": 7 } }
    ]
  },
  "how_to_dial_in": [
    "Set the amp loud — Hendrix drove his amps hard.",
    "Adjust the Big Muff sustain until the fuzz blooms naturally.",
    "Roll the tone knob on the guitar to 7 to tame the harshness."
  ],
  "what_i_couldnt_match": [
    "An Octavia octave fuzz is not in your inventory."
  ],
  "confidence": 0.74
}
```

---

## Inventory Format

Edit `inventory.yml` at the repo root. All IDs must be unique strings.

```yaml
version: 1
owner: "your-name"

units:
  knobs: "0-10"      # default knob scale
  time: "ms"

guitars:
  - id: strat_sss                     # unique stable ID
    name: "Fender Stratocaster (SSS)"
    pickups: ["sss"]
    pickup_positions: ["bridge", "bridge_middle", "middle", "middle_neck", "neck"]
    notes: ["bright glassy cleans"]

amps:
  - id: vox_ac30
    name: "Vox AC30 style"
    type: "combo"
    channels: ["normal", "top_boost"]
    controls: ["gain", "bass", "treble", "cut", "master"]
    notes: ["chime and jangle"]

pedals:
  - id: ts_od
    name: "Tube Screamer style OD"
    category: "overdrive"
    controls: ["drive", "tone", "level"]

cabs_irs:
  enabled: false
  items: []

constraints:
  max_pedals_in_chain: 6
  must_choose_from_inventory_only: true
  output_format: "json"
  allowed_alternatives: true
```

---

## Development

```bash
# Type-check only (no emit)
npm run lint

# Build
npm run build

# Run without building (uses tsx)
npm run dev -- <command>
```

---

## Project Structure

```
guitar-sound-advisor/
├── src/
│   ├── index.ts       # CLI entry (commander commands)
│   ├── schema.ts      # Zod schemas for inventory + adviser output
│   ├── inventory.ts   # YAML loader + validator
│   ├── prompt.ts      # Prompt builder
│   ├── model.ts       # LLM client wrapper (OpenAI)
│   └── chat.ts        # Interactive chat loop
├── inventory.yml      # Your gear list — edit this!
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT
