const TIER_COLORS = {
  common: "#e8b64c",
  rare: "#7fd7ff",
  epic: "#e0574a",
};

const DEFAULT_TIER_COLOR = TIER_COLORS.common;
const BEST_WAVE_KEY = "dlb-best-wave";
const BEST_SCORE_KEY = "dlb-best-score";

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

  const heroGrid = el("hero-grid");
  const startBtn = el("start-btn");
  const retryBtn = el("retry-btn");
  const heroCards = new Map();

  let selectedId = null;
  let lastCombo = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let damageTimer = 0;

  function selectHero(id, notify) {
    if (id === undefined || id === null) return;
    selectedId = id;
    for (const [cardId, card] of heroCards) {
      if (cardId === id) card.classList.add("selected");
      else card.classList.remove("selected");
    }
    startBtn.disabled = false;
    startBtn.textContent = "Enter the dungeon";
    if (notify) emit("hero-selected", { id });
  }

  charList.forEach((hero, index) => {
    const id = (hero && (hero.id || hero.name)) || String(index);
    const card = create("button");
    card.type = "button";
    card.className = "hero-card stone";

    const color = hero && Number.isFinite(hero.color) ? hero.color >>> 0 : 0xffffff;
    const hex = "#" + color.toString(16).padStart(6, "0");
    card.style.setProperty("--hero-accent", hex);
    card.style.setProperty("--hero-tint", hex);

    const portrait = create("div");
    portrait.className = "hero-portrait";
    card.appendChild(portrait);

    const title = create("h3");
    title.textContent = (hero && hero.name) || id;
    card.appendChild(title);

    const blurb = create("p");
    blurb.className = "hero-blurb";
    blurb.textContent = (hero && hero.blurb) || "";
    card.appendChild(blurb);

    const stats = create("div");
    stats.className = "hero-stats";
    const rows = [
      ["HP", hero && hero.hp],
      ["DMG", hero && hero.damage],
      ["SPD", hero && hero.moveSpeed],
    ];
    for (const [label, value] of rows) {
      const stat = create("div");
      stat.className = "hero-stat";
      stat.textContent = label;
      const b = create("b");
      b.textContent = value === undefined || value === null ? "-" : String(value);
      stat.appendChild(b);
      stats.appendChild(stat);
    }
    card.appendChild(stats);

    card.addEventListener("click", () => selectHero(id, true));
    heroGrid.appendChild(card);
    heroCards.set(id, card);
  });

  startBtn.addEventListener("click", () => {
    if (startBtn.disabled || !selectedId) return;
    emit("start-run", {});
    emit("sfx", { name: "ui-click" });
  });

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
      btn.className = "upgrade-card stone";
      btn.style.setProperty("--tier-color", TIER_COLORS[tier] || DEFAULT_TIER_COLOR);

      const tag = create("div");
      tag.className = "tier-tag";
      tag.textContent = tier;
      btn.appendChild(tag);

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
    for (const [value, label] of rows) {
      const stat = create("div");
      stat.className = "death-stat";
      const b = create("b");
      b.textContent = String(value);
      const span = create("span");
      span.textContent = label;
      stat.appendChild(b);
      stat.appendChild(span);
      box.appendChild(stat);
    }

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

    setText(el("coin-num"), 0);
    setText(el("score-num"), 0);

    for (const card of heroCards.values()) card.classList.remove("selected");
    selectedId = null;
    startBtn.disabled = true;
    startBtn.textContent = "Choose your hero";
  }

  function setSelectedHero(id) {
    selectHero(id, false);
  }

  listen("player-hurt", () => flashDamage());
  listen("player-died", () => {});
  listen("coin-collected", () => {});

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
