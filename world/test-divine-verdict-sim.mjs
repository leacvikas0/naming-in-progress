import assert from 'node:assert/strict';
import { createCampaignLoop } from './src/combat/campaign-loop.js';
import {
  HERO_STATS,
  COMMUNE_MAX_DISTANCE,
  COMMUNE_COMBAT_HP_THRESHOLD,
  POWERUP_TETHER_DISTANCE,
  DIVINE_BLESSING_DURATION,
  DIVINE_BLESSING_TETHER_DISTANCE,
  DIVINE_BLESSING_DMG_MULT,
  DIVINE_BLESSING_Q_CD_MULT,
  DIVINE_BLESSING_E_CD_MULT,
} from './src/combat/combat-balance.js';

// 0. Locked combat-balance constants
assert.equal(COMMUNE_MAX_DISTANCE, 4.0);
assert.equal(COMMUNE_COMBAT_HP_THRESHOLD, 0.35);
assert.equal(POWERUP_TETHER_DISTANCE, 5.0);
assert.equal(DIVINE_BLESSING_DURATION, 30.0);
assert.equal(DIVINE_BLESSING_TETHER_DISTANCE, 5.0);
assert.equal(DIVINE_BLESSING_DMG_MULT, 2.0);
assert.ok(Math.abs(DIVINE_BLESSING_Q_CD_MULT - 1 / 3) < 1e-6);
assert.equal(DIVINE_BLESSING_E_CD_MULT, 0.5);

const mockEnemies = [];
const enemyManager = {
  get activeEnemies() {
    return mockEnemies;
  },
  get spawnQueue() {
    return [];
  },
  setCurrentActId() {},
  clearAllEnemies() {
    mockEnemies.length = 0;
  },
  applyAreaOrLineHit() {
    throw new Error('Prayer/Blessing must deal ZERO direct damage to enemies!');
  },
  applyPrayerAirborneThrow() {
    return { thrownCount: mockEnemies.length };
  },
  update() {},
};

const loop = createCampaignLoop({ enemyManager });
const heroStates = {
  Knight: { id: 'Knight', x: 0, y: 0, z: 0, yaw: 0 },
  Mage: { id: 'Mage', x: 4.5, y: 0, z: 0, yaw: 0 },
};

// 1. Strict 4.0m Circle Rule: 4.5m apart must be rejected
assert.equal(loop.canCommuneTogether(heroStates).allowed, false);
assert.equal(loop.canCommuneTogether(heroStates).reason, 'too_far');

// Move within 3.2m (<= 4.0m): allowed out of combat even at 100% HP
heroStates.Mage.x = 3.2;
assert.equal(loop.canCommuneTogether(heroStates).allowed, true);

// 2. Combat Eligibility Rule: in combat at 100% HP -> rejected; at < 35% HP or Downed -> allowed
mockEnemies.push({ id: 'e1', x: 4, z: 0, hp: 100, maxHp: 100, dead: false, active: true });
assert.equal(loop.canCommuneTogether(heroStates).allowed, false);
assert.equal(loop.canCommuneTogether(heroStates).reason, 'combat_hp_too_high');

loop.combatHeroes.Mage.hp = 28; // 28 / 90 = 31.1% (< 35%)
assert.equal(loop.canCommuneTogether(heroStates).allowed, true);

// 3. Phase 2A: 4.8s Blessing/Resurrection sequence (0 direct enemy damage, smooth underground HP fill)
loop.combatHeroes.Mage.hp = 0;
loop.combatHeroes.Mage.downed = true;
loop.combatHeroes.Knight.hp = 70;
loop.applyCommuneVerdict({ verdict: 'blessing' }, 'Knight', heroStates);

assert.equal(loop.isControlLocked(), true, 'Controls must be locked during the 4.8s Blessing cinematic');
loop.update(2.35, { heroStates, soloWingmanActive: false }); // Beat 2 (2.35s)
assert.ok(loop.combatHeroes.Knight.hp === 70, 'HP fill starts in Beat 3 (2.65s..4.25s)');

loop.update(1.10, { heroStates, soloWingmanActive: false }); // Beat 3 mid (3.45s = 50% through 2.65..4.25s)
assert.equal(loop.combatHeroes.Mage.downed, false, 'Dead partner must be revived underground during Beat 3');
assert.ok(loop.combatHeroes.Knight.hp > 130 && loop.combatHeroes.Knight.hp < 220, 'HP must smoothly fill during Beat 3');
assert.ok(loop.combatHeroes.Mage.hp > 35 && loop.combatHeroes.Mage.hp < 90);

loop.update(1.40, { heroStates, soloWingmanActive: false }); // 4.85s -> Blessing cinematic complete!
assert.equal(loop.isControlLocked(), false, 'Controls must unlock after 4.80s');
assert.equal(loop.combatHeroes.Knight.hp, HERO_STATS.Knight.maxHp);
assert.equal(loop.combatHeroes.Mage.hp, HERO_STATS.Mage.maxHp);
assert.equal(loop.isDivineBlessingActive(), true);
assert.ok(
  Math.hypot(heroStates.Knight.x - heroStates.Mage.x, heroStates.Knight.z - heroStates.Mage.z) <= 1.6,
  'Both heroes must pop up side-by-side (~1.35m apart) after Beat 3 underground reposition'
);

// 4. Phase 2B: 30s Proximity Blessing (<= 5.0m Tether: 100% Invincibility, 2x DMG, 1/3 Q CD, 1/2 E CD)
const hitWhileBlessed = loop.handlePlayerHit({ id: 'Mage' }, mockEnemies[0], 85);
assert.equal(hitWhileBlessed.hpLost, 0, 'Must take 0 damage (100% invincible) while Blessing tether <= 5.0m');
assert.equal(hitWhileBlessed.invincible, true);
assert.equal(loop.combatHeroes.Mage.hp, 90);

// Break enemyManager.applyAreaOrLineHit guard to allow player E/Q skills to test cooldowns
enemyManager.applyAreaOrLineHit = () => [];
const mageERes = loop.performPartnerSkill('Mage', heroStates);
assert.equal(mageERes.cooldown, 4.25, 'Mage E cooldown must be halved (8.5s -> 4.25s) during Blessing');
const knightERes = loop.performPartnerSkill('Knight', heroStates);
assert.equal(knightERes.downtime, 2.5, 'Knight E downtime must be halved (5.0s -> 2.5s, total CD 15.5s) during Blessing');
assert.equal(knightERes.cooldown, 15.5);
const knightQRes = loop.performKnightUltimate(heroStates);
assert.equal(knightQRes.cooldown, 8.0, 'Knight Q cooldown must be 1/3 (24s -> 8.0s) during Blessing');
const mageQRes = loop.performMageStormCataclysm(heroStates);
assert.equal(mageQRes.cooldown, 8.0, 'Mage Q cooldown must be 1/3 (24s -> 8.0s) during Blessing');

// Hard Separation Rule: moving > 5.0m apart immediately breaks the 30s Blessing!
heroStates.Knight.x = 0;
heroStates.Knight.z = 0;
heroStates.Mage.x = 5.05;
heroStates.Mage.z = 0;
loop.update(0.016, { heroStates, soloWingmanActive: false });
assert.equal(loop.isDivineBlessingActive(), false, 'Blessing must break immediately when distance > 5.0m');
assert.equal(loop.combatHeroes.Knight.partnerSwordMult, 1.0);
assert.equal(loop.combatHeroes.Mage.partnerMagicMult, 1.0);

// 5. Phase 2C: Smite when both alive -> Partner dies (0 HP / downed), Speaker drops to 10% Max HP (22 HP Knight)
heroStates.Mage.x = 2.0;
loop.applyCommuneVerdict({ verdict: 'smite' }, 'Knight', heroStates);
assert.equal(loop.isControlLocked(), true, 'Controls must lock for 2.8s during Smite');
assert.equal(loop.combatHeroes.Mage.hp, 0);
assert.equal(loop.combatHeroes.Mage.downed, true);
assert.equal(loop.combatHeroes.Knight.hp, 22, 'Knight speaker must drop to 10% Max HP (22 HP)');

// 6. Phase 2C: Smite when Partner is ALREADY dead -> Speaker dies -> Total Party Wipe!
loop.update(2.85, { heroStates, soloWingmanActive: false });
assert.equal(loop.isControlLocked(), false);
loop.applyCommuneVerdict({ verdict: 'smite' }, 'Knight', heroStates);
assert.equal(loop.combatHeroes.Knight.hp, 0);
assert.equal(loop.combatHeroes.Knight.downed, true);
assert.equal(loop.combatHeroes.Mage.downed, true);
console.log('PASS test-divine-verdict-sim');
