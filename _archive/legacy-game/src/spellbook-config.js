// The mage's spellbook rotation.
//
// Today the list has three spells and the next-cast index in player.js walks it
// A -> B -> C -> A on every accepted cast. Adding a fourth spell later means one
// entry here and one VFX module; the player does not change.
import { ICE_LANCE } from "./ice-lance-config.js";
import { STORM_LANCE } from "./storm-lance-config.js";
import { GLACIAL_CROWN } from "./glacial-crown-config.js";

export const SPELLS = {
  "ice-lance": ICE_LANCE,
  "storm-lance": STORM_LANCE,
  "glacial-crown": GLACIAL_CROWN,
};

export const ACTIVE_SPELLS = ["ice-lance", "storm-lance", "glacial-crown"];

export function spellConfig(id) {
  return SPELLS[id] || null;
}
