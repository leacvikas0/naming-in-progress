// The species barrel. `createMeadow()` imports this only when you do not pass
// your own `species` array, so trimming the pack never breaks anything else.
//
// Order is draw order: ground cover first, then flowers.

import { spec as grass } from "./grass.js";
import { spec as broadLeaf } from "./broadLeaf.js";
import { spec as daisy } from "./daisy.js";
import { spec as buttercup } from "./buttercup.js";
import { spec as clover } from "./clover.js";
import { spec as campanula } from "./campanula.js";
import { spec as lupine } from "./lupine.js";
import { spec as cosmos } from "./cosmos.js";
import { spec as phlox } from "./phlox.js";
import { spec as blossomPuff } from "./blossomPuff.js";

export const SPECIES = [
  grass,
  broadLeaf,
  clover,
  daisy,
  buttercup,
  phlox,
  campanula,
  lupine,
  cosmos,
  blossomPuff,
];

export default SPECIES;
