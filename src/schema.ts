import { z } from "zod";

// ─── Inventory Schemas ────────────────────────────────────────────────────────

export const GuitarSchema = z.object({
  id: z.string(),
  name: z.string(),
  pickups: z.array(z.string()),
  pickup_positions: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});

export const AmpSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  amp_type: z.string().optional(),
  effects_loop: z.boolean().optional(),
  channels: z.array(z.string()).optional(),
  controls: z.array(z.string()),
  notes: z.array(z.string()).optional(),
});

export const PedalSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  controls: z.array(z.string()),
  notes: z.array(z.string()).optional(),
});

export const CabIRItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.array(z.string()).optional(),
});

export const CabsIRsSchema = z.object({
  enabled: z.boolean(),
  items: z.array(CabIRItemSchema),
});

export const ConstraintsSchema = z.object({
  max_pedals_in_chain: z.number().int().positive(),
  must_choose_from_inventory_only: z.boolean(),
  output_format: z.string(),
  allowed_alternatives: z.boolean().optional(),
});

export const UnitsSchema = z.object({
  knobs: z.string().optional(),
  time: z.string().optional(),
  gain: z.string().optional(),
  volume: z.string().optional(),
});

export const InventorySchema = z.object({
  version: z.number(),
  owner: z.string().optional(),
  units: UnitsSchema.optional(),
  guitars: z.array(GuitarSchema).min(1, "At least one guitar is required"),
  amps: z.array(AmpSchema).min(1, "At least one amp is required"),
  pedals: z.array(PedalSchema),
  cabs_irs: CabsIRsSchema.optional(),
  constraints: ConstraintsSchema,
});

export type Inventory = z.infer<typeof InventorySchema>;
export type Guitar = z.infer<typeof GuitarSchema>;
export type Amp = z.infer<typeof AmpSchema>;
export type Pedal = z.infer<typeof PedalSchema>;

// ─── Adviser Output Schemas ───────────────────────────────────────────────────

export const ArtistInfoSchema = z.object({
  overview: z.string(),
  genres: z.array(z.string()),
  known_for: z.string(),
  signature_tone: z.string(),
});

export const GuitarSettingsSchema = z.object({
  id: z.string(),
  pickup_position: z.string().optional(),
  tone_knob: z.number().min(0).max(10).optional(),
  volume_knob: z.number().min(0).max(10).optional(),
});

export const AmpSettingsSchema = z.object({
  id: z.string(),
  channel: z.string().optional(),
  settings: z.record(z.union([z.number(), z.string()])),
});

export const PedalSettingsSchema = z.object({
  id: z.string(),
  on: z.boolean(),
  settings: z.record(z.union([z.number(), z.string()])),
});

export const RigSchema = z.object({
  guitar: GuitarSettingsSchema,
  amp: AmpSettingsSchema,
  pedal_chain: z.array(PedalSettingsSchema),
});

export const AdviserOutputSchema = z.object({
  request: z.object({
    artist: z.string(),
    song: z.string(),
  }),
  artist_info: ArtistInfoSchema.optional(),
  assumptions: z.array(z.string()),
  rig: RigSchema,
  how_to_dial_in: z.array(z.string()),
  what_i_couldnt_match: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type AdviserOutput = z.infer<typeof AdviserOutputSchema>;
export type ArtistInfo = z.infer<typeof ArtistInfoSchema>;
