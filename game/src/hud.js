import { pxUrl } from "./assets.js";

const TIER_COLORS = {
  common: "#e8c169",
  rare: "#7fd7ff",
  epic: "#f0a03c",
};

// Element id -> chip dot colour. Mirrors balance.js ELEMENTS, but hud must not
// import the data table; it only needs these four hexes.
const ELEMENT_COLORS = {
  frost: "#7fd7ff",
  ember: "#ff7a2a",
  shadow: "#9b6fe8",
  arcane: "#7fe8c8",
};

const DEFAULT_TIER_COLOR = TIER_COLORS.common;
const BEST_WAVE_KEY = "dlb-best-wave";
const BEST_SCORE_KEY = "dlb-best-score";

// Upgrade id → the pixel glyph that represents it. Falls back to the flask so
// a new upgrade always has art.
const UPGRADE_ICONS = {
  whetstone: "dmg",
  boots: "spd",
  ironheart: "hp",
  keen: "dmg",
  reach: "dmg",
  wide: "dmg",
  greed: "coin",
  frenzy: "dmg",
  vampire: "hp",
  shadowstep: "clock",
  thorns: "shield",
  titan: "dmg",
  glass: "dmg",
  reaper: "clock",
};

const DEATH_ICONS = ["skull", "dmg", "coin", "star"];

function iconUrl(name) {
  return pxUrl(`icon-${name}`);
}

function makeDummy() {
  const dummy = {
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; } },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    textContent: "",
    innerHTML: "",
    className: "",
    children: [],
    disabled: false,
    offsetWidth: 0,
    type: "",
    src: "",
    alt: "",
    width: 0,
    height: 0,
    parentNode: null,
    firstChild: null,
    appendChild() { return dummy; },
    removeChild() { return dummy; },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    replaceChildren() {},
  };
  return dummy;
}

function create(tag) {
  if (typeof document !== "undefined" && document && typeof document.createElement === "function") {
    return document.createElement(tag);
  }
  return makeDummy();
}

function setText(node, value) {
  node.textContent = value === undefined || value === null ? "" : String(value);
}

function show(node) {
  node.classList.remove("hidden");
}

function hide(node) {
  node.classList.add("hidden");
}

function retrigger(node) {
  node.style.animation = "none";
  void node.offsetWidth;
  node.style.animation = "";
}

function getStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch (err) {
    return null;
  }
}

function readStoredInt(key) {
  const ls = getStorage();
  if (!ls) return 0;
  try {
    const n = parseInt(ls.getItem(key), 10);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    return 0;
  }
}

function writeStoredInt(key, value) {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(key, String(value));
  } catch (err) {
    return;
  }
}

export function createHUD({ events, characters } = {}) {
  const bus = events && typeof events === "object" ? events : null;
  const charList = characters && typeof characters === "object" ? Object.values(characters) : [];

  const cache = new Map();

  function el(id) {
    if (!cache.has(id)) {
      let node = null;
      if (typeof document !== "undefined" && document && typeof document.getElementById === "function") {
        try {
          node = document.getElementById(id);
        } catch (err) {
          node = null;
        }
      }
      cache.set(id, node || makeDummy());
    }
    return cache.get(id);
  }

  function emit(name, payload) {
    if (bus && typeof bus.emit === "function") bus.emit(name, payload);
  }

  function listen(name, fn) {
    if (bus && typeof bus.on === "function") bus.on(name, fn);
  }

  // The party chips are looked up once and their inner refs cached. Under the
  // headless makeDummy() pattern querySelectorAll/querySelector return
  // nothing, so every ref falls back to a dummy and update() stays safe.
  const partyChips = [];

  function ensureChips() {
    if (partyChips.length) return partyChips;
    const host = el("party-bar");
    const found = host && typeof host.querySelectorAll === "function" ? host.querySelectorAll(".party-chip") : [];
    const list = found ? Array.from(found) : [];
    for (let i = 0; i < 2; i++) {
      let chip = list[i] || null;
      if (!chip) {
        chip = create("div");
        chip.className = "party-chip px-slab";
        const sigil = create("span");
        sigil.className = "party-sigil";
        const img = create("img");
        img.className = "px-icon party-sigil-img";
        img.alt = "";
        sigil.appendChild(img);
        chip.appendChild(sigil);
        const body = create("div");
        body.className = "party-body";
        const name = create("span");
        name.className = "party-name";
        name.textContent = "—";
        body.appendChild(name);
        const trough = create("div");
        trough.className = "party-trough px-trough";
        const hp = create("div");
        hp.className = "party-hp";
        trough.appendChild(hp);
        body.appendChild(trough);
        chip.appendChild(body);
        const elem = create("span");
        elem.className = "party-elem";
        elem.setAttribute("aria-hidden", "true");
        chip.appendChild(elem);
        host.appendChild(chip);
      }
      if (chip && typeof chip.addEventListener === "function") {
        const slot = i;
        chip.addEventListener("click", () => emit("party-slot", { index: slot }));
      }
      const q = (sel) => (chip && typeof chip.querySelector === "function" ? chip.querySelector(sel) : null);
      partyChips.push({
        chip,
        img: q(".party-sigil-img") || makeDummy(),
        name: q(".party-name") || makeDummy(),
        hp: q(".party-hp") || makeDummy(),
        elem: q(".party-elem") || makeDummy(),
      });
    }
    return partyChips;
  }

  function flashChip(index) {
    const refs = ensureChips()[index];
    if (!refs) return;
    const chip = refs.chip;
    chip.classList.remove("flash");
    void chip.offsetWidth;
    chip.classList.add("flash");
    if (chipFlashTimers[index]) clearTimeout(chipFlashTimers[index]);
    chipFlashTimers[index] = setTimeout(() => {
      chip.classList.remove("flash");
      chipFlashTimers[index] = 0;
    }, 560);
  }

  function superKeycap() {
    const host = el("ability-super");
    return host && typeof host.querySelector === "function" ? host.querySelector(".ability-key") : null;
  }

  const startBtn = el("start-btn");
  const retryBtn = el("retry-btn");

  let selectedId = null;
  let lastCombo = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let damageTimer = 0;
  let dodgeTimer = 0;
  let reactionTimer = 0;
  let lastPartyDefs = [];
  const chipFlashTimers = [0, 0];

  function selectHero(id, notify) {
    if (id === undefined || id === null) return;
    selectedId = id;
    if (notify) emit("hero-selected", { id });
  }

  retryBtn.addEventListener("click", () => {
    emit("retry", {});
    emit("sfx", { name: "ui-click" });
  });

  function update(state) {
    const s = state && typeof state === "object" ? state : {};
    const maxHp = Number(s.maxHp) > 0 ? Math.round(Number(s.maxHp)) : 0;
    const hp = Math.max(0, Number(s.hp) || 0);
    const frac = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;

    setText(el("hp-num"), Math.ceil(hp));
    setText(el("hp-max"), "/" + maxHp);
    el("hp-fill").style.transform = "scaleX(" + frac + ")";
    el("hp-bar").classList.toggle("low", frac < 0.3);

    setText(el("wave-num"), s.wave ?? 1);
    const enemies = Math.max(0, Number(s.enemies) || 0);
    setText(el("enemy-num"), enemies);
    el("enemy-block").classList.toggle("danger", enemies <= 3);
    setText(el("coin-num"), s.coins ?? 0);
    setText(el("score-num"), s.score ?? 0);

    const dodgeFrac = Math.min(1, Math.max(0, Number(s.dodgeFrac) || 0));
    el("dodge-cd").style.transform = "scaleY(" + dodgeFrac + ")";
    el("ability-dodge").classList.toggle("ready", dodgeFrac <= 0.001);

    const swapFrac = Math.min(1, Math.max(0, Number(s.swapFrac) || 0));
    el("swap-cd").style.transform = "scaleY(" + swapFrac + ")";
    el("ability-swap").classList.toggle("ready", swapFrac <= 0.001);

    const momentumMax = Number(s.momentumMax) > 0 ? Number(s.momentumMax) : 100;
    const momentum = Math.min(momentumMax, Math.max(0, Number(s.momentum) || 0));
    const momentumFrac = momentumMax > 0 ? momentum / momentumMax : 0;
    el("momentum-fill").style.transform = "scaleX(" + momentumFrac + ")";
    const superReady = s.superReady === true || momentumFrac >= 0.999;
    el("momentum-trough").classList.toggle("ready", superReady);
    el("ability-super").classList.toggle("ready", superReady);
    const superKey = superKeycap();
    if (superKey && superKey.classList) superKey.classList.toggle("hot", superReady);

    const party = Array.isArray(s.party) ? s.party : [];
    const chips = ensureChips();
    const partyDefs = [];
    for (let i = 0; i < chips.length; i++) {
      const entry = party[i];
      const refs = chips[i];
      if (!entry) {
        partyDefs.push(null);
        refs.name.textContent = "—";
        refs.hp.style.transform = "scaleX(0)";
        refs.chip.classList.remove("active", "low", "down");
        continue;
      }
      const def = entry.def && typeof entry.def === "object" ? entry.def : {};
      const id = def.id || (typeof entry.def === "string" ? entry.def : null);
      partyDefs.push(def);
      const maxHp = Number(entry.maxHp) > 0 ? Number(entry.maxHp) : 0;
      const hp = Math.max(0, Number(entry.hp) || 0);
      const frac = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;
      refs.name.textContent = def.name || (id ? String(id) : "—");
      if (id && refs.img && "src" in refs.img) refs.img.src = pxUrl(`sigil-${id}`);
      refs.hp.style.transform = "scaleX(" + frac + ")";
      refs.chip.classList.toggle("low", frac > 0 && frac < 0.3);
      refs.chip.classList.toggle("down", hp <= 0);
      const color = ELEMENT_COLORS[def.element];
      if (refs.elem && refs.elem.style && typeof refs.elem.style.setProperty === "function") {
        refs.elem.style.setProperty("--elem-color", color || "transparent");
      }
      const activeId = s.activeHero && typeof s.activeHero === "object" ? s.activeHero.id : s.activeHero;
      refs.chip.classList.toggle("active", activeId !== undefined && activeId !== null && activeId === id);
    }
    lastPartyDefs = partyDefs;

    const combo = Math.floor(Number(s.combo) || 0);
    const comboTag = el("combo-tag");
    if (combo > 1) {
      if (combo !== lastCombo) {
        show(comboTag);
        comboTag.textContent = "COMBO ×" + combo;
        retrigger(comboTag);
      }
    } else {
      hide(comboTag);
    }
    lastCombo = combo;
  }

  function showTitle() {
    show(el("title-screen"));
  }

  function hideTitle() {
    hide(el("title-screen"));
  }

  function showLoading(text) {
    if (text !== undefined && text !== null) setText(el("loading-text"), text);
    show(el("loading-screen"));
  }

  function hideLoading() {
    hide(el("loading-screen"));
  }

  function showWaveBanner(n, sub) {
    const banner = el("wave-banner");
    show(banner);
    setText(el("wave-banner-num"), n);
    setText(el("wave-banner-sub"), sub);
    retrigger(banner);
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = 0;
    }
    bannerTimer = setTimeout(() => {
      hide(banner);
      bannerTimer = 0;
    }, 2600);
  }

  function showUpgrades(cards) {
    const row = el("card-row");
    row.innerHTML = "";
    const list = Array.isArray(cards) ? cards : [];
    for (const card of list) {
      const tier = card && card.tier ? String(card.tier) : "common";
      const btn = create("button");
      btn.type = "button";
      btn.className = "upgrade-card px-ornate";
      if (tier === "rare" || tier === "epic") btn.classList.add(tier);
      btn.style.setProperty("--tier-color", TIER_COLORS[tier] || DEFAULT_TIER_COLOR);

      const head = create("div");
      head.className = "card-head";
      const img = create("img");
      img.className = "card-icon";
      img.src = iconUrl(UPGRADE_ICONS[card && card.id] || "flask");
      img.alt = "";
      img.width = 32;
      img.height = 32;
      head.appendChild(img);
      const tag = create("div");
      tag.className = "tier-tag";
      tag.textContent = tier;
      head.appendChild(tag);
      btn.appendChild(head);

      const name = create("h3");
      name.textContent = (card && card.name) || "";
      btn.appendChild(name);

      const desc = create("p");
      desc.textContent = (card && card.desc) || "";
      btn.appendChild(desc);

      const hint = create("div");
      hint.className = "pick-hint";
      hint.textContent = "Take it";
      btn.appendChild(hint);

      const cardId = card && card.id;
      btn.addEventListener("click", () => {
        emit("upgrade-chosen", { id: cardId });
        hideUpgrades();
        emit("sfx", { name: "ui-click" });
      });
      row.appendChild(btn);
    }
    show(el("upgrade-screen"));
  }

  function hideUpgrades() {
    hide(el("upgrade-screen"));
    el("card-row").innerHTML = "";
  }

  function showDeath(stats) {
    const s = stats && typeof stats === "object" ? stats : {};
    const wave = Math.max(0, Math.floor(Number(s.wave) || 0));
    const kills = Math.max(0, Math.floor(Number(s.kills) || 0));
    const coins = Math.max(0, Math.floor(Number(s.coins) || 0));
    const score = Math.max(0, Math.floor(Number(s.score) || 0));

    const title = el("death-title");
    if (wave < 3) title.textContent = "The dungeon barely noticed";
    else if (wave < 6) title.textContent = "The dungeon keeps you";
    else if (wave < 10) title.textContent = "They will sing of this run";
    else title.textContent = "A legend, buried";

    const bestWave = readStoredInt(BEST_WAVE_KEY);
    const bestScore = readStoredInt(BEST_SCORE_KEY);
    setText(el("death-best"), bestWave >= wave ? "Best: wave " + bestWave : "");

    const box = el("death-stats");
    box.innerHTML = "";
    const rows = [
      [wave, "Waves"],
      [kills, "Kills"],
      [coins, "Coins"],
      [score, "Score"],
    ];
    rows.forEach(([value, label], i) => {
      const stat = create("div");
      stat.className = "death-stat";

      const img = create("img");
      img.src = iconUrl(DEATH_ICONS[i] || "skull");
      img.alt = "";
      // 32 = exactly 2x the 16px source. Non-integer scales (e.g. 24px = 1.5x)
      // give some source pixels 2 screen pixels and others 1, which reads as
      // blur/unevenness even with image-rendering: pixelated.
      img.width = 32;
      img.height = 32;
      stat.appendChild(img);

      const b = create("b");
      b.textContent = String(value);
      const span = create("span");
      span.textContent = label;
      stat.appendChild(b);
      stat.appendChild(span);
      box.appendChild(stat);
    });

    if (wave > bestWave) writeStoredInt(BEST_WAVE_KEY, wave);
    if (score > bestScore) writeStoredInt(BEST_SCORE_KEY, score);

    show(el("death-screen"));
  }

  function hideDeath() {
    hide(el("death-screen"));
  }

  function flashDamage() {
    const flash = el("damage-flash");
    flash.classList.add("hit");
    if (damageTimer) {
      clearTimeout(damageTimer);
      damageTimer = 0;
    }
    damageTimer = setTimeout(() => {
      flash.classList.remove("hit");
      damageTimer = 0;
    }, 110);
  }

  function showToast(text) {
    const toast = el("toast");
    setText(toast, text);
    toast.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toastTimer = 0;
    }, 1800);
  }

  function addUpgradePip(card) {
    const pip = create("div");
    pip.className = "upgrade-pip";
    const tier = card && card.tier ? String(card.tier) : "";
    if (tier === "rare" || tier === "epic") pip.classList.add(tier);
    pip.textContent = (card && card.name) || "";
    el("upgrade-strip").appendChild(pip);
  }

  function reset() {
    el("upgrade-strip").innerHTML = "";
    show(el("hud"));

    const comboTag = el("combo-tag");
    hide(comboTag);
    comboTag.textContent = "";
    comboTag.style.animation = "";
    lastCombo = 0;

    el("hp-bar").classList.remove("low");
    el("hp-fill").style.transform = "scaleX(1)";
    el("dodge-cd").style.transform = "scaleY(0)";
    el("ability-dodge").classList.remove("ready");

    el("swap-cd").style.transform = "scaleY(0)";
    el("ability-swap").classList.remove("ready", "flash");
    el("momentum-fill").style.transform = "scaleX(0)";
    el("momentum-trough").classList.remove("ready");
    el("ability-super").classList.remove("ready");
    const key = superKeycap();
    if (key) key.classList.remove("hot");

    const chips = ensureChips();
    for (const refs of chips) {
      refs.name.textContent = "—";
      refs.hp.style.transform = "scaleX(0)";
      refs.chip.classList.remove("active", "low", "down", "flash");
    }
    lastPartyDefs = [];

    hide(el("reaction-toast"));
    el("dodge-flash").classList.remove("hit");

    setText(el("coin-num"), 0);
    setText(el("score-num"), 0);

    selectedId = null;
  }

  function setSelectedHero(id) {
    selectHero(id, false);
  }

  function showReactionToast(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const toast = el("reaction-toast");
    const name = p.name || p.type || "Reaction";
    setText(toast, name);
    const color = typeof p.color === "string" ? p.color : ELEMENT_COLORS[p.type];
    if (color && toast.style && typeof toast.style.setProperty === "function") {
      toast.style.setProperty("--reaction-color", color);
    }
    toast.classList.add("show");
    if (reactionTimer) {
      clearTimeout(reactionTimer);
      reactionTimer = 0;
    }
    reactionTimer = setTimeout(() => {
      toast.classList.remove("show");
      reactionTimer = 0;
    }, 1400);
  }

  function flashDodge() {
    const flash = el("dodge-flash");
    flash.classList.add("hit");
    if (dodgeTimer) {
      clearTimeout(dodgeTimer);
      dodgeTimer = 0;
    }
    dodgeTimer = setTimeout(() => {
      flash.classList.remove("hit");
      dodgeTimer = 0;
    }, 140);
  }

  function onSwap(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    // `to` is an element id on the frozen payload; older/hand-rolled emitters
    // may pass a hero id. Match the party slot by either, and flash the
    // incoming chip. Falls back to slot 0 when the party is not known yet.
    const to = p.to && typeof p.to === "object" ? p.to.id : p.to;
    if (to === undefined || to === null) return;
    let index = lastPartyDefs.findIndex((def) => def && (def.id === to || def.element === to));
    if (index < 0) index = 0;
    flashChip(index);
  }

  listen("player-hurt", () => flashDamage());
  listen("player-died", () => {});
  listen("coin-collected", () => {});
  listen("reaction", (payload) => showReactionToast(payload));
  listen("swap", (payload) => onSwap(payload));
  listen("perfect-dodge", () => flashDodge());
  listen("wave-start", (payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    // `sub` is pre-formatted by main.js (modifier name and/or elite count);
    // fall back to the modifier name alone for older emitters.
    const modifier = p.modifier;
    const sub = typeof p.sub === "string" && p.sub.length
      ? p.sub
      : modifier && typeof modifier === "object"
        ? modifier.name
        : "";
    showWaveBanner(p.wave ?? 1, sub);
  });

  return {
    update,
    showTitle,
    hideTitle,
    showLoading,
    hideLoading,
    showUpgrades,
    hideUpgrades,
    showDeath,
    hideDeath,
    showWaveBanner,
    flashDamage,
    showToast,
    addUpgradePip,
    reset,
    setSelectedHero,
  };
}
