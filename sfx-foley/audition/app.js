/* ==========================================================================
   HARU-MACHI FOLEY LAB - 100-VARIATION AUDITION STUDIO
   Core Application Logic (app.js)
   ========================================================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'haru_foley_100_ratings_v1';

  // Strictly enforce zero em-dashes or en-dashes in rendered text
  function cleanDashes(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[\u2014\u2013]/g, '-');
  }

  function pad3(n) {
    var s = String(n || 0);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  function fmtNum(val, digits) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '--';
    return Number(val).toFixed(digits !== undefined ? digits : 4);
  }

  // Application State
  var state = {
    manifest: null,
    variations: [],
    filteredVariations: [],
    selectedId: 'v001',
    pinnedAId: null,
    abActiveTarget: 'B', // 'A' or 'B' when pinnedAId is active
    audioMode: 'polished', // 'polished' (.mp4) | 'raw' (.mp3)
    activeBeatId: 'ALL', // 'ALL' | 'B1' | 'B2' | 'B3' | 'B4'
    marathonMode: false,
    promptTab: 'pos', // 'pos' | 'neg'
    viewMode: 'table', // 'table' | 'grid'
    filters: {
      group: 'ALL',
      guidance: 'ALL',
      rating: 'HAS_METRICS',
      dsp: 'ALL',
      search: '',
      sort: 'index_asc'
    },
    ratings: {}, // { v001: { status: 'STARRED'|'REJECTED'|'UNRATED', note: '' } }
    autoPollTimer: null,
    isPlaying: false,
    timelineSegments: []
  };

  // DOM References
  var dom = {};

  function cacheDom() {
    dom.clipMetaLabel = document.getElementById('clip-meta-label');
    dom.statReady = document.getElementById('stat-ready');
    dom.statStarred = document.getElementById('stat-starred');
    dom.statRejected = document.getElementById('stat-rejected');
    dom.statShown = document.getElementById('stat-shown');

    dom.btnAutopoll = document.getElementById('btn-autopoll');
    dom.btnRefreshManifest = document.getElementById('btn-refresh-manifest');
    dom.btnKeysModal = document.getElementById('btn-keys-modal');
    dom.btnExportShortlist = document.getElementById('btn-export-shortlist');

    dom.hudMainText = document.getElementById('hud-main-text');
    dom.hudAbBadge = document.getElementById('hud-ab-badge');
    dom.hudLoopBadge = document.getElementById('hud-loop-badge');
    dom.hudAudioBadge = document.getElementById('hud-audio-badge');

    dom.video = document.getElementById('stage-video');
    dom.rawAudio = document.getElementById('stage-raw-audio');
    dom.videoStatusOverlay = document.getElementById('video-status-overlay');
    dom.videoStatusTitle = document.getElementById('video-status-title');
    dom.videoStatusSub = document.getElementById('video-status-sub');
    dom.btnRetryVideo = document.getElementById('btn-retry-video');
    dom.btnSkipNext = document.getElementById('btn-skip-next');

    dom.tlTimeCur = document.getElementById('tl-time-cur');
    dom.tlTimeDur = document.getElementById('tl-time-dur');
    dom.tlFrameCur = document.getElementById('tl-frame-cur');
    dom.tlActiveSeg = document.getElementById('tl-active-seg');
    dom.tlLoopMode = document.getElementById('tl-loop-mode');
    dom.timelineTrack = document.getElementById('timeline-track');
    dom.tlPlayhead = document.getElementById('tl-playhead');

    dom.btnPrev = document.getElementById('btn-prev');
    dom.btnPlayPause = document.getElementById('btn-play-pause');
    dom.btnNext = document.getElementById('btn-next');
    dom.btnMarathon = document.getElementById('btn-marathon');
    dom.btnModePolished = document.getElementById('btn-mode-polished');
    dom.btnModeRaw = document.getElementById('btn-mode-raw');
    dom.btnStarCur = document.getElementById('btn-star-cur');
    dom.btnRejectCur = document.getElementById('btn-reject-cur');
    dom.btnPinA = document.getElementById('btn-pin-a');

    dom.inspGroupHeader = document.getElementById('insp-group-header');
    dom.inspRecipeBadge = document.getElementById('insp-recipe-badge');
    dom.inspTitle = document.getElementById('insp-title');
    dom.inspHypothesis = document.getElementById('insp-hypothesis');
    dom.inspNoteInput = document.getElementById('insp-note-input');

    dom.abStatusLabel = document.getElementById('ab-status-label');
    dom.abEmptyState = document.getElementById('ab-empty-state');
    dom.abActiveContent = document.getElementById('ab-active-content');
    dom.btnPinAInline = document.getElementById('btn-pin-a-inline');
    dom.btnPlayA = document.getElementById('btn-play-a');
    dom.btnPlayB = document.getElementById('btn-play-b');
    dom.abBtnLabelA = document.getElementById('ab-btn-label-a');
    dom.abBtnLabelB = document.getElementById('ab-btn-label-b');
    dom.btnClearA = document.getElementById('btn-clear-a');
    dom.abThA = document.getElementById('ab-th-a');
    dom.abThB = document.getElementById('ab-th-b');
    dom.abDiffTbody = document.getElementById('ab-diff-tbody');

    dom.inspMetricsStatus = document.getElementById('insp-metrics-status');
    dom.mSubRms = document.getElementById('m-sub-rms');
    dom.mMidRms = document.getElementById('m-mid-rms');
    dom.mHighRms = document.getElementById('m-high-rms');
    dom.mAirRms = document.getElementById('m-air-rms');
    dom.mPauseRms = document.getElementById('m-pause-rms');
    dom.mPeakDb = document.getElementById('m-peak-db');
    dom.mElapsedS = document.getElementById('m-elapsed-s');

    dom.mBarSub = document.getElementById('m-bar-sub');
    dom.mBarMid = document.getElementById('m-bar-mid');
    dom.mBarHigh = document.getElementById('m-bar-high');
    dom.mBarAir = document.getElementById('m-bar-air');
    dom.mBarPause = document.getElementById('m-bar-pause');
    dom.mBarPeak = document.getElementById('m-bar-peak');
    dom.mBarElapsed = document.getElementById('m-bar-elapsed');

    dom.inspPathsLabel = document.getElementById('insp-paths-label');
    dom.pGuidanceMode = document.getElementById('p-guidance-mode');
    dom.pCfgScale = document.getElementById('p-cfg-scale');
    dom.pSamplerSteps = document.getElementById('p-sampler-steps');
    dom.pShifts = document.getElementById('p-shifts');
    dom.pWindowPhi = document.getElementById('p-window-phi');
    dom.pNegpip = document.getElementById('p-negpip');
    dom.pDspMode = document.getElementById('p-dsp-mode');
    dom.pSeedNeg = document.getElementById('p-seed-neg');

    dom.btnTabPosPrompt = document.getElementById('btn-tab-pos-prompt');
    dom.btnTabNegPrompt = document.getElementById('btn-tab-neg-prompt');
    dom.inspPromptText = document.getElementById('insp-prompt-text');

    dom.filterGroupStrip = document.getElementById('filter-group-strip');
    dom.filterGuidanceStrip = document.getElementById('filter-guidance-strip');
    dom.filterRatingStrip = document.getElementById('filter-rating-strip');
    dom.filterDspSelect = document.getElementById('filter-dsp-select');
    dom.searchInput = document.getElementById('search-input');
    dom.sortSelect = document.getElementById('sort-select');
    dom.btnViewTable = document.getElementById('btn-view-table');
    dom.btnViewGrid = document.getElementById('btn-view-grid');
    dom.btnResetFilters = document.getElementById('btn-reset-filters');

    dom.catalogContainer = document.getElementById('catalog-container');

    dom.modalBackdrop = document.getElementById('modal-backdrop');
    dom.modalTitle = document.getElementById('modal-title');
    dom.modalBody = document.getElementById('modal-body');
    dom.btnCloseModal = document.getElementById('btn-close-modal');
  }

  // ==========================================================================
  // LOCALSTORAGE RATINGS & NOTES
  // ==========================================================================
  function loadRatings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.ratings = JSON.parse(raw) || {};
      }
    } catch (err) {
      console.warn('Failed to read localStorage ratings:', err);
      state.ratings = {};
    }
  }

  function saveRatings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ratings));
    } catch (err) {
      console.warn('Failed to save localStorage ratings:', err);
    }
  }

  function getRatingEntry(id) {
    return state.ratings[id] || { status: 'UNRATED', note: '' };
  }

  function setRatingStatus(id, targetStatus) {
    var cur = getRatingEntry(id);
    var nextStatus = cur.status === targetStatus ? 'UNRATED' : targetStatus;
    state.ratings[id] = {
      status: nextStatus,
      note: cur.note || '',
      updatedAt: new Date().toISOString()
    };
    saveRatings();
    applyFiltersAndRender();
    renderInspector();
  }

  function setRatingNote(id, noteText) {
    var cur = getRatingEntry(id);
    state.ratings[id] = {
      status: cur.status || 'UNRATED',
      note: cleanDashes(noteText),
      updatedAt: new Date().toISOString()
    };
    saveRatings();
    updateCatalogRowNoteIndicator(id);
  }

  // ==========================================================================
  // MANIFEST INGESTION & LIVE FETCH
  // ==========================================================================
  function normalizeVariation(v) {
    return {
      id: v.id,
      index: Number(v.index),
      group_id: cleanDashes(v.group_id),
      group_title: cleanDashes(v.group_title),
      title: cleanDashes(v.title),
      hypothesis: cleanDashes(v.hypothesis),
      recipe_key: cleanDashes(v.recipe_key),
      prompt: cleanDashes(v.prompt),
      neg_key: cleanDashes(v.neg_key),
      neg_prompt: cleanDashes(v.neg_prompt),
      guidance_mode: cleanDashes(v.guidance_mode),
      cfg_scale: Number(v.cfg_scale),
      seed: Number(v.seed),
      sampler_name: cleanDashes(v.sampler_name),
      n_steps: Number(v.n_steps),
      shift_video: Number(v.shift_video),
      shift_audio: Number(v.shift_audio),
      dsp_mode: cleanDashes(v.dsp_mode),
      neg_has_video: Boolean(v.neg_has_video),
      negpip_weight: Number(v.negpip_weight || 0),
      window_range: Array.isArray(v.window_range) ? v.window_range : [0, Number(v.n_steps || 16)],
      rescale_phi: Number(v.rescale_phi || 0),
      video_Path: v.video_Path || v.video_path || ('videos/' + v.id + '.mp4'),
      raw_audio_path: v.raw_audio_path || ('videos/' + v.id + '_raw.mp3'),
      metrics: v.metrics || null
    };
  }

  function ingestManifestData(data, isRefresh) {
    if (!data || !Array.isArray(data.variations)) return;
    state.manifest = data;
    state.variations = data.variations.map(normalizeVariation);

    if (dom.clipMetaLabel && data.clip_name) {
      dom.clipMetaLabel.textContent = cleanDashes(
        data.clip_name + ' | ' + (data.duration_s || 5.875) + 's | ' + (data.frames || 141) + 'f @ ' + (data.fps || 24) + 'fps'
      );
    }

    if (!isRefresh) {
      buildTimelineSegments();
      buildFilterControls();
    }

    applyFiltersAndRender();
    renderInspector();
  }

  function fetchLatestManifestJson(showFeedback) {
    if (showFeedback && dom.btnRefreshManifest) {
      dom.btnRefreshManifest.textContent = 'SYNCING...';
    }
    fetch('./manifest.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        ingestManifestData(json, true);
        if (showFeedback && dom.btnRefreshManifest) {
          dom.btnRefreshManifest.textContent = 'SYNCED OK';
          setTimeout(function () {
            dom.btnRefreshManifest.textContent = 'SYNC MANIFEST';
          }, 1200);
        }
      })
      .catch(function () {
        if (showFeedback && dom.btnRefreshManifest) {
          dom.btnRefreshManifest.textContent = 'USING LOCAL JS';
          setTimeout(function () {
            dom.btnRefreshManifest.textContent = 'SYNC MANIFEST';
          }, 1200);
        }
      });
  }

  // ==========================================================================
  // 4-BEAT INTERACTIVE TIMELINE CONSTRUCTION & SEEK/LOOP ENGINE
  // ==========================================================================
  function buildTimelineSegments() {
    var dur = (state.manifest && state.manifest.duration_s) ? Number(state.manifest.duration_s) : 5.875;
    var beats = (state.manifest && Array.isArray(state.manifest.beats)) ? state.manifest.beats : [
      { id: 'B1', label: 'Glacial Dragon Awakening', start_s: 0.25, end_s: 1.25 },
      { id: 'B2', label: 'Glacial Sword Slash', start_s: 1.83, end_s: 2.65 },
      { id: 'B3', label: 'Sunfire Dragon Awakening', start_s: 3.33, end_s: 4.33 },
      { id: 'B4', label: 'Sunfire Sword Slash', start_s: 4.75, end_s: 5.45 }
    ];

    var segments = [];
    var cursor = 0.0;
    var silenceIdx = 1;

    beats.forEach(function (b) {
      if (b.start_s > cursor + 0.005) {
        segments.push({
          id: 'S' + silenceIdx,
          type: 'silence',
          label: 'Silence ' + silenceIdx,
          start_s: Number(cursor.toFixed(3)),
          end_s: Number(b.start_s.toFixed(3))
        });
        silenceIdx++;
      }
      segments.push({
        id: b.id,
        type: 'beat',
        label: cleanDashes(b.label),
        start_s: Number(b.start_s),
        end_s: Number(b.end_s)
      });
      cursor = Number(b.end_s);
    });

    if (cursor < dur - 0.005) {
      segments.push({
        id: 'S' + silenceIdx,
        type: 'silence',
        label: 'Silence ' + silenceIdx,
        start_s: Number(cursor.toFixed(3)),
        end_s: Number(dur.toFixed(3))
      });
    }

    state.timelineSegments = segments;
    if (dom.tlTimeDur) dom.tlTimeDur.textContent = dur.toFixed(3);

    // Render segments inside #timeline-track
    var track = dom.timelineTrack;
    if (!track) return;
    var playhead = dom.tlPlayhead;
    track.innerHTML = '';

    segments.forEach(function (seg) {
      var widthPct = ((seg.end_s - seg.start_s) / dur) * 100;
      var el = document.createElement('div');
      el.className = 'tl-segment ' + (seg.type === 'beat' ? 'is-beat' : 'is-silence');
      el.style.width = widthPct.toFixed(4) + '%';
      el.dataset.segId = seg.id;
      el.dataset.segType = seg.type;
      el.title = seg.id + ': ' + seg.label + ' (' + seg.start_s.toFixed(2) + 's - ' + seg.end_s.toFixed(2) + 's)';

      var idSpan = document.createElement('div');
      idSpan.className = 'tl-seg-id';
      idSpan.textContent = seg.id;

      var lblSpan = document.createElement('div');
      lblSpan.className = 'tl-seg-label';
      lblSpan.textContent = seg.type === 'beat' ? seg.label : (seg.end_s - seg.start_s).toFixed(2) + 's';

      el.appendChild(idSpan);
      el.appendChild(lblSpan);

      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (seg.type === 'beat') {
          selectBeatLoop(seg.id);
        } else {
          // Clicking a silence segment seeks to where user clicked inside the track
          var rect = track.getBoundingClientRect();
          var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          selectBeatLoop('ALL', false);
          seekStageTo(ratio * dur, true);
        }
      });

      track.appendChild(el);
    });

    if (playhead) {
      track.appendChild(playhead);
    }
  }

  function getBeatById(beatId) {
    if (!beatId || beatId === 'ALL') return null;
    for (var i = 0; i < state.timelineSegments.length; i++) {
      var s = state.timelineSegments[i];
      if (s.id === beatId && s.type === 'beat') return s;
    }
    return null;
  }

  function selectBeatLoop(beatId, autoSeekAndPlay) {
    if (autoSeekAndPlay === undefined) autoSeekAndPlay = true;
    // If clicking the already active beat button, toggle back to ALL if desired or re-seek
    state.activeBeatId = beatId || 'ALL';

    // Update beat buttons UI
    var btns = document.querySelectorAll('.beat-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle('is-active', b.dataset.beatId === state.activeBeatId);
    }

    // Update timeline segment highlight
    var segEls = dom.timelineTrack ? dom.timelineTrack.querySelectorAll('.tl-segment.is-beat') : [];
    for (var j = 0; j < segEls.length; j++) {
      segEls[j].classList.toggle('is-looping', segEls[j].dataset.segId === state.activeBeatId);
    }

    var beat = getBeatById(state.activeBeatId);
    if (beat) {
      dom.tlLoopMode.textContent = 'LOOP ' + beat.id + ' (' + beat.start_s.toFixed(2) + '-' + beat.end_s.toFixed(2) + 's)';
      dom.hudLoopBadge.style.display = 'inline-block';
      dom.hudLoopBadge.textContent = 'LOOP ' + beat.id;
      if (autoSeekAndPlay) {
        seekStageTo(beat.start_s, true);
      }
    } else {
      var dur = (state.manifest && state.manifest.duration_s) ? Number(state.manifest.duration_s) : 5.875;
      dom.tlLoopMode.textContent = 'FULL ' + dur.toFixed(3) + 's';
      dom.hudLoopBadge.style.display = 'none';
      if (autoSeekAndPlay) {
        seekStageTo(0, true);
      }
    }
  }

  // ==========================================================================
  // STAGE MEDIA PLAYBACK & RAW 32kHz AUDIO SYNCHRONIZATION
  // ==========================================================================
  function getVariationById(id) {
    for (var i = 0; i < state.variations.length; i++) {
      if (state.variations[i].id === id) return state.variations[i];
    }
    return state.variations[0] || null;
  }

  function getStageActiveVariation() {
    if (state.pinnedAId && state.abActiveTarget === 'A') {
      return getVariationById(state.pinnedAId) || getVariationById(state.selectedId);
    }
    return getVariationById(state.selectedId);
  }

  function syncAudioModeToElements() {
    var isRaw = state.audioMode === 'raw';
    dom.btnModePolished.classList.toggle('is-active', !isRaw);
    dom.btnModeRaw.classList.toggle('is-raw-active', isRaw);

    dom.hudAudioBadge.textContent = isRaw ? 'RAW 32kHz .MP3' : 'POLISHED .MP4';
    dom.hudAudioBadge.classList.toggle('is-raw', isRaw);

    if (!dom.video || !dom.rawAudio) return;

    if (isRaw) {
      dom.video.muted = true;
      dom.rawAudio.muted = false;
      if (Math.abs((dom.rawAudio.currentTime || 0) - (dom.video.currentTime || 0)) > 0.04) {
        try {
          dom.rawAudio.currentTime = dom.video.currentTime || 0;
        } catch (e) {}
      }
      if (!dom.video.paused) {
        var p = dom.rawAudio.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } else {
      dom.video.muted = false;
      dom.rawAudio.muted = true;
      dom.rawAudio.pause();
    }
  }

  function setAudioMode(mode) {
    state.audioMode = mode === 'raw' ? 'raw' : 'polished';
    syncAudioModeToElements();
  }

  function toggleAudioMode() {
    setAudioMode(state.audioMode === 'raw' ? 'polished' : 'raw');
  }

  function updateBakedHud() {
    var v = getStageActiveVariation();
    if (!v) return;

    var cfgStr = v.guidance_mode + ' (' + v.cfg_scale.toFixed(2) + ')';
    dom.hudMainText.textContent = cleanDashes(
      '[#' + pad3(v.index) + '] [' + v.group_id + '] ' + v.title + ' | ' + cfgStr + ' | s' + v.seed + ' | ' + v.dsp_mode
    );

    if (state.pinnedAId) {
      dom.hudAbBadge.style.display = 'inline-block';
      dom.hudAbBadge.textContent = state.abActiveTarget === 'A'
        ? 'PLAYING [A] #' + pad3(v.index)
        : 'PLAYING [B] #' + pad3(v.index);
    } else {
      dom.hudAbBadge.style.display = 'none';
    }
  }

  function loadVariationOnStage(v, preserveTimestamp, autoPlay) {
    if (!v || !dom.video || !dom.rawAudio) return;
    var targetTime = preserveTimestamp ? (dom.video.currentTime || 0) : 0;
    var beat = getBeatById(state.activeBeatId);
    if (!preserveTimestamp && beat) {
      targetTime = beat.start_s;
    }

    dom.videoStatusOverlay.classList.add('is-hidden');
    updateBakedHud();

    var nextVideoSrc = v.video_Path;
    var nextAudioSrc = v.raw_audio_path;

    dom.video.src = nextVideoSrc;
    dom.rawAudio.src = nextAudioSrc;

    dom.video.load();
    dom.rawAudio.load();

    var onLoadedMeta = function () {
      dom.video.removeEventListener('loadedmetadata', onLoadedMeta);
      try {
        dom.video.currentTime = targetTime;
        dom.rawAudio.currentTime = targetTime;
      } catch (e) {}
      syncAudioModeToElements();
      if (autoPlay) {
        playStage();
      } else {
        updatePlayheadUI();
      }
    };

    dom.video.addEventListener('loadedmetadata', onLoadedMeta);
  }

  function seekStageTo(timeSec, shouldPlay) {
    if (!dom.video) return;
    var dur = (state.manifest && state.manifest.duration_s) ? Number(state.manifest.duration_s) : 5.875;
    var clamped = Math.max(0, Math.min(dur, Number(timeSec) || 0));
    try {
      dom.video.currentTime = clamped;
      if (dom.rawAudio && dom.rawAudio.readyState >= 1) {
        dom.rawAudio.currentTime = clamped;
      }
    } catch (e) {}
    updatePlayheadUI();
    if (shouldPlay) {
      playStage();
    }
  }

  function playStage() {
    if (!dom.video) return;
    syncAudioModeToElements();
    var p = dom.video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        // Video might not be rendered yet or autoplay blocked
      });
    }
  }

  function pauseStage() {
    if (!dom.video) return;
    dom.video.pause();
    if (dom.rawAudio) dom.rawAudio.pause();
  }

  function togglePlayPause() {
    if (!dom.video) return;
    if (dom.video.paused) {
      playStage();
    } else {
      pauseStage();
    }
  }

  function updatePlayheadUI() {
    if (!dom.video) return;
    var t = dom.video.currentTime || 0;
    var dur = (state.manifest && state.manifest.duration_s) ? Number(state.manifest.duration_s) : 5.875;
    var fps = (state.manifest && state.manifest.fps) ? Number(state.manifest.fps) : 24;

    var beat = getBeatById(state.activeBeatId);
    if (beat && !dom.video.paused && t >= beat.end_s) {
      seekStageTo(beat.start_s, true);
      t = beat.start_s;
    }

    var pct = Math.max(0, Math.min(100, (t / dur) * 100));
    if (dom.tlPlayhead) {
      dom.tlPlayhead.style.left = pct.toFixed(2) + '%';
    }
    if (dom.tlTimeCur) {
      dom.tlTimeCur.textContent = t.toFixed(3);
    }
    if (dom.tlFrameCur) {
      var frameIdx = Math.min(141, Math.floor(t * fps));
      dom.tlFrameCur.textContent = pad3(frameIdx);
    }

    // Identify current active segment
    var curSegLabel = 'S1 SILENCE';
    for (var i = 0; i < state.timelineSegments.length; i++) {
      var s = state.timelineSegments[i];
      if (t >= s.start_s && t <= s.end_s + 0.005) {
        curSegLabel = s.id + ' ' + s.label.toUpperCase();
        break;
      }
    }
    if (dom.tlActiveSeg) {
      dom.tlActiveSeg.textContent = curSegLabel;
    }

    // Keep raw audio locked if in raw mode
    if (state.audioMode === 'raw' && !dom.video.paused && dom.rawAudio && dom.rawAudio.readyState >= 2) {
      var drift = Math.abs((dom.rawAudio.currentTime || 0) - t);
      if (drift > 0.045) {
        try {
          dom.rawAudio.currentTime = t;
        } catch (e) {}
      }
      if (dom.rawAudio.paused) {
        var rp = dom.rawAudio.play();
        if (rp && typeof rp.catch === 'function') rp.catch(function () {});
      }
    }
  }

  function startRafPlayheadLoop() {
    function tick() {
      if (dom.video && !dom.video.paused) {
        updatePlayheadUI();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ==========================================================================
  // VARIATION SELECTION, A/B COMPARATOR & INSPECTOR RENDERING
  // ==========================================================================
  function selectVariation(id, autoPlay) {
    if (!id) return;
    var changed = state.selectedId !== id;
    state.selectedId = id;
    state.abActiveTarget = 'B';

    highlightSelectedInCatalog();
    renderInspector();

    var v = getVariationById(id);
    if (v && (changed || autoPlay)) {
      loadVariationOnStage(v, false, Boolean(autoPlay));
    } else {
      updateBakedHud();
    }
  }

  function stepVariation(delta) {
    var list = state.filteredVariations;
    if (!list.length) return;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.selectedId) {
        idx = i;
        break;
      }
    }
    var nextIdx = idx === -1 ? 0 : (idx + delta + list.length) % list.length;
    var target = list[nextIdx];
    if (target) {
      selectVariation(target.id, true);
      scrollCatalogItemIntoView(target.id);
    }
  }

  function togglePinA(targetId) {
    var idToPin = targetId || state.selectedId;
    if (state.pinnedAId === idToPin) {
      state.pinnedAId = null;
      state.abActiveTarget = 'B';
    } else {
      state.pinnedAId = idToPin;
      state.abActiveTarget = 'B';
    }
    highlightSelectedInCatalog();
    renderInspector();
    updateBakedHud();
  }

  function switchAbPlayback(target) {
    if (!state.pinnedAId) return;
    var nextTarget = (target === 'A' || target === 'B')
      ? target
      : (state.abActiveTarget === 'A' ? 'B' : 'A');

    state.abActiveTarget = nextTarget;
    var wasPlaying = dom.video && !dom.video.paused;
    var v = getStageActiveVariation();
    loadVariationOnStage(v, true, wasPlaying);
    renderAbComparator();
    updateBakedHud();
  }

  function renderAbComparator() {
    var vB = getVariationById(state.selectedId);
    var vA = state.pinnedAId ? getVariationById(state.pinnedAId) : null;

    var isCurrentPinned = state.pinnedAId && state.pinnedAId === state.selectedId;
    dom.btnPinA.classList.toggle('is-active', Boolean(isCurrentPinned));
    dom.btnPinA.innerHTML = isCurrentPinned
      ? 'PINNED AS A <span class="kbd-hint">P</span>'
      : 'PIN AS A <span class="kbd-hint">P</span>';

    if (!vA || !vB) {
      dom.abStatusLabel.textContent = 'NO REFERENCE [A] PINNED';
      dom.abEmptyState.style.display = 'flex';
      dom.abActiveContent.style.display = 'none';
      return;
    }

    dom.abStatusLabel.textContent = 'ACTIVE DIFF: [A] #' + pad3(vA.index) + ' vs [B] #' + pad3(vB.index);
    dom.abEmptyState.style.display = 'none';
    dom.abActiveContent.style.display = 'block';

    dom.abBtnLabelA.textContent = '#' + pad3(vA.index) + ' (' + vA.id + ')';
    dom.abBtnLabelB.textContent = '#' + pad3(vB.index) + ' (' + vB.id + ')';
    dom.btnPlayA.classList.toggle('is-active', state.abActiveTarget === 'A');
    dom.btnPlayB.classList.toggle('is-active', state.abActiveTarget === 'B');

    dom.abThA.textContent = 'REF [A] #' + pad3(vA.index) + ' - ' + vA.title.slice(0, 26);
    dom.abThB.textContent = 'CAND [B] #' + pad3(vB.index) + ' - ' + vB.title.slice(0, 26);

    var mA = vA.metrics || {};
    var mB = vB.metrics || {};

    var rows = [
      ['Group', vA.group_id, vB.group_id],
      ['Recipe Key', vA.recipe_key, vB.recipe_key],
      ['Guidance Mode', vA.guidance_mode, vB.guidance_mode],
      ['CFG Scale', vA.cfg_scale.toFixed(2), vB.cfg_scale.toFixed(2)],
      ['Window / Rescale Phi', '[' + vA.window_range.join('..') + '] / ' + vA.rescale_phi, '[' + vB.window_range.join('..') + '] / ' + vB.rescale_phi],
      ['Neg Key / Neg Video', vA.neg_key + ' (vid:' + vA.neg_has_video + ')', vB.neg_key + ' (vid:' + vB.neg_has_video + ')'],
      ['NegPiP Weight', vA.negpip_weight.toFixed(2), vB.negpip_weight.toFixed(2)],
      ['Sampler / Steps', vA.sampler_name + ' / ' + vA.n_steps, vB.sampler_name + ' / ' + vB.n_steps],
      ['Shift (Video / Audio)', vA.shift_video + ' / ' + vA.shift_audio, vB.shift_video + ' / ' + vB.shift_audio],
      ['DSP Mode', vA.dsp_mode, vB.dsp_mode],
      ['Seed', String(vA.seed), String(vB.seed)],
      ['Sub RMS / High RMS', fmtNum(mA.sub_rms, 4) + ' / ' + fmtNum(mA.high_rms, 4), fmtNum(mB.sub_rms, 4) + ' / ' + fmtNum(mB.high_rms, 4)],
      ['Pause RMS (Silence)', fmtNum(mA.pause_rms, 5), fmtNum(mB.pause_rms, 5)],
      ['Peak dB / Render s', fmtNum(mA.peak_db, 2) + ' dB / ' + fmtNum(mA.elapsed_s, 1) + 's', fmtNum(mB.peak_db, 2) + ' dB / ' + fmtNum(mB.elapsed_s, 1) + 's']
    ];

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var isDiff = r[1] !== r[2];
      html += '<tr class="' + (isDiff ? 'is-diff' : '') + '">' +
        '<td>' + escapeHtml(r[0]) + (isDiff ? ' *' : '') + '</td>' +
        '<td>' + escapeHtml(r[1]) + '</td>' +
        '<td>' + escapeHtml(r[2]) + '</td>' +
        '</tr>';
    }
    dom.abDiffTbody.innerHTML = html;
  }

  function renderInspector() {
    var v = getVariationById(state.selectedId);
    if (!v) return;

    var rating = getRatingEntry(v.id);

    dom.btnStarCur.classList.toggle('is-active', rating.status === 'STARRED');
    dom.btnRejectCur.classList.toggle('is-active', rating.status === 'REJECTED');

    dom.inspGroupHeader.textContent = cleanDashes('[#' + pad3(v.index) + '] ' + v.group_id + ' - ' + v.group_title.toUpperCase());
    dom.inspRecipeBadge.textContent = 'recipe: ' + v.recipe_key;
    dom.inspTitle.textContent = v.title;
    dom.inspHypothesis.textContent = v.hypothesis;

    if (document.activeElement !== dom.inspNoteInput) {
      dom.inspNoteInput.value = rating.note || '';
    }

    // Parameters
    dom.inspPathsLabel.textContent = v.video_Path + ' | ' + v.raw_audio_path;
    dom.pGuidanceMode.textContent = v.guidance_mode;
    dom.pCfgScale.textContent = v.cfg_scale.toFixed(2);
    dom.pSamplerSteps.textContent = v.sampler_name + ' / ' + v.n_steps + ' steps';
    dom.pShifts.textContent = 'V:' + v.shift_video.toFixed(1) + ' / A:' + v.shift_audio.toFixed(1);
    dom.pWindowPhi.textContent = '[' + v.window_range.join('..') + '] / phi:' + v.rescale_phi.toFixed(2);
    dom.pNegpip.textContent = 'w:' + v.negpip_weight.toFixed(2) + ' / vid:' + String(v.neg_has_video);
    dom.pDspMode.textContent = v.dsp_mode;
    dom.pSeedNeg.textContent = 's' + v.seed + ' / ' + v.neg_key;

    // Metrics
    var m = v.metrics;
    if (m && typeof m === 'object') {
      dom.inspMetricsStatus.textContent = 'MEASURED SPECTRAL TELEMETRY';
      dom.mSubRms.textContent = fmtNum(m.sub_rms, 4);
      dom.mMidRms.textContent = fmtNum(m.mid_rms, 4);
      dom.mHighRms.textContent = fmtNum(m.high_rms, 4);
      dom.mAirRms.textContent = fmtNum(m.air_rms, 4);
      dom.mPauseRms.textContent = fmtNum(m.pause_rms, 5);
      dom.mPeakDb.textContent = fmtNum(m.peak_db, 2) + ' dB';
      dom.mElapsedS.textContent = fmtNum(m.elapsed_s, 2) + 's';

      dom.mBarSub.style.width = Math.min(100, (Number(m.sub_rms || 0) / 0.25) * 100).toFixed(1) + '%';
      dom.mBarMid.style.width = Math.min(100, (Number(m.mid_rms || 0) / 0.20) * 100).toFixed(1) + '%';
      dom.mBarHigh.style.width = Math.min(100, (Number(m.high_rms || 0) / 0.12) * 100).toFixed(1) + '%';
      dom.mBarAir.style.width = Math.min(100, (Number(m.air_rms || 0) / 0.08) * 100).toFixed(1) + '%';
      dom.mBarPause.style.width = Math.min(100, (Number(m.pause_rms || 0) / 0.05) * 100).toFixed(1) + '%';
      dom.mBarPeak.style.width = Math.min(100, Math.max(5, ((Number(m.peak_db || -20) + 30) / 30) * 100)).toFixed(1) + '%';
      dom.mBarElapsed.style.width = Math.min(100, (Number(m.elapsed_s || 0) / 15) * 100).toFixed(1) + '%';
    } else {
      dom.inspMetricsStatus.textContent = 'AWAITING GPU RUNNER METRICS (CLICK SYNC MANIFEST)';
      dom.mSubRms.textContent = '--';
      dom.mMidRms.textContent = '--';
      dom.mHighRms.textContent = '--';
      dom.mAirRms.textContent = '--';
      dom.mPauseRms.textContent = '--';
      dom.mPeakDb.textContent = '--';
      dom.mElapsedS.textContent = '--';

      dom.mBarSub.style.width = '0%';
      dom.mBarMid.style.width = '0%';
      dom.mBarHigh.style.width = '0%';
      dom.mBarAir.style.width = '0%';
      dom.mBarPause.style.width = '0%';
      dom.mBarPeak.style.width = '0%';
      dom.mBarElapsed.style.width = '0%';
    }

    // Prompts
    renderPromptBox(v);

    // A/B Comparator
    renderAbComparator();
  }

  function renderPromptBox(v) {
    if (!v) return;
    dom.btnTabPosPrompt.classList.toggle('is-active', state.promptTab === 'pos');
    dom.btnTabNegPrompt.classList.toggle('is-active', state.promptTab === 'neg');

    if (state.promptTab === 'pos') {
      dom.inspPromptText.textContent = v.prompt || '(Empty positive prompt)';
    } else {
      dom.inspPromptText.textContent = v.neg_prompt
        ? ('[neg_key: ' + v.neg_key + ' | neg_has_video: ' + v.neg_has_video + ']\n\n' + v.neg_prompt)
        : '[neg_key: ' + v.neg_key + '] (Zero negative prompt)';
    }
  }

  // ==========================================================================
  // FILTERING, SORTING & 100-VARIATION CATALOG RENDERING
  // ==========================================================================
  function buildFilterControls() {
    // 1. Groups
    var groupMap = {};
    var guidanceSet = {};
    var dspSet = {};

    state.variations.forEach(function (v) {
      if (!groupMap[v.group_id]) {
        groupMap[v.group_id] = { id: v.group_id, title: v.group_title, count: 0 };
      }
      groupMap[v.group_id].count++;
      guidanceSet[v.guidance_mode] = (guidanceSet[v.guidance_mode] || 0) + 1;
      dspSet[v.dsp_mode] = (dspSet[v.dsp_mode] || 0) + 1;
    });

    var groupHtml = '<button type="button" class="filter-chip is-active" data-group="ALL">ALL (' + state.variations.length + ')</button>';
    Object.keys(groupMap).sort().forEach(function (gid) {
      var g = groupMap[gid];
      groupHtml += '<button type="button" class="filter-chip" data-group="' + escapeHtml(gid) + '" title="' + escapeHtml(g.title) + '">' +
        escapeHtml(gid) + ' (' + g.count + ')</button>';
    });
    dom.filterGroupStrip.innerHTML = groupHtml;

    // 2. Guidance modes
    var guidanceOrder = ['basic_cfg1', 'cfg_standard', 'cfg_windowed', 'cfg_rescaled', 'cfg_text_only_neg', 'negpip_vflip'];
    var gHtml = '<button type="button" class="filter-chip is-active" data-guidance="ALL">ALL</button>';
    guidanceOrder.forEach(function (gm) {
      if (guidanceSet[gm]) {
        gHtml += '<button type="button" class="filter-chip" data-guidance="' + escapeHtml(gm) + '">' +
          escapeHtml(gm) + ' (' + guidanceSet[gm] + ')</button>';
      }
    });
    dom.filterGuidanceStrip.innerHTML = gHtml;

    // 3. DSP Select
    var dspHtml = '<option value="ALL">ALL DSP MODES</option>';
    Object.keys(dspSet).forEach(function (dm) {
      dspHtml += '<option value="' + escapeHtml(dm) + '">' + escapeHtml(dm) + ' (' + dspSet[dm] + ')</option>';
    });
    dom.filterDspSelect.innerHTML = dspHtml;
  }

  function applyFiltersAndRender() {
    var f = state.filters;
    var q = (f.search || '').trim().toLowerCase();

    var readyCount = 0;
    var starCount = 0;
    var rejCount = 0;

    state.variations.forEach(function (v) {
      if (v.metrics) readyCount++;
      var r = getRatingEntry(v.id);
      if (r.status === 'STARRED') starCount++;
      if (r.status === 'REJECTED') rejCount++;
    });

    var filtered = state.variations.filter(function (v) {
      if (f.group !== 'ALL' && v.group_id !== f.group) return false;
      if (f.guidance !== 'ALL' && v.guidance_mode !== f.guidance) return false;
      if (f.dsp !== 'ALL' && v.dsp_mode !== f.dsp) return false;

      var r = getRatingEntry(v.id);
      if (f.rating === 'STARRED' && r.status !== 'STARRED') return false;
      if (f.rating === 'REJECTED' && r.status !== 'REJECTED') return false;
      if (f.rating === 'UNRATED' && r.status !== 'UNRATED') return false;
      if (f.rating === 'HAS_METRICS' && !v.metrics) return false;

      if (q) {
        var hay = (
          v.id + ' #' + pad3(v.index) + ' ' +
          v.group_id + ' ' + v.group_title + ' ' +
          v.title + ' ' + v.hypothesis + ' ' +
          v.recipe_key + ' ' + v.neg_key + ' ' +
          v.guidance_mode + ' ' + v.dsp_mode + ' ' +
          v.sampler_name + ' s' + v.seed + ' ' +
          (r.note || '') + ' ' + v.prompt
        ).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    // Sort
    filtered.sort(function (a, b) {
      if (f.sort === 'pause_asc') {
        var pa = (a.metrics && a.metrics.pause_rms !== undefined) ? Number(a.metrics.pause_rms) : 999;
        var pb = (b.metrics && b.metrics.pause_rms !== undefined) ? Number(b.metrics.pause_rms) : 999;
        if (pa !== pb) return pa - pb;
      } else if (f.sort === 'sub_desc') {
        var sa = (a.metrics && a.metrics.sub_rms !== undefined) ? Number(a.metrics.sub_rms) : -1;
        var sb = (b.metrics && b.metrics.sub_rms !== undefined) ? Number(b.metrics.sub_rms) : -1;
        if (sa !== sb) return sb - sa;
      } else if (f.sort === 'high_desc') {
        var ha = (a.metrics && a.metrics.high_rms !== undefined) ? Number(a.metrics.high_rms) : -1;
        var hb = (b.metrics && b.metrics.high_rms !== undefined) ? Number(b.metrics.high_rms) : -1;
        if (ha !== hb) return hb - ha;
      } else if (f.sort === 'cfg_desc') {
        if (b.cfg_scale !== a.cfg_scale) return b.cfg_scale - a.cfg_scale;
      }
      return a.index - b.index;
    });

    state.filteredVariations = filtered;

    // Update top counters
    dom.statReady.textContent = 'METRICS: ' + readyCount + '/' + state.variations.length;
    dom.statStarred.textContent = 'STAR: ' + starCount;
    dom.statRejected.textContent = 'REJ: ' + rejCount;
    dom.statShown.textContent = 'SHOWN: ' + filtered.length;

    renderCatalog();
  }

  function renderCatalog() {
    var list = state.filteredVariations;
    if (!dom.catalogContainer) return;

    if (!list.length) {
      dom.catalogContainer.innerHTML =
        '<div class="box-panel" style="padding: 24px; text-align: center; font-family: var(--font-mono);">' +
        'NO VARIATIONS MATCH CURRENT FILTER CRITERIA.</div>';
      return;
    }

    if (state.viewMode === 'grid') {
      renderCatalogGrid(list);
    } else {
      renderCatalogTable(list);
    }
  }

  function renderCatalogTable(list) {
    var html = '<table class="var-table">' +
      '<thead><tr>' +
      '<th style="width: 44px;">#ID</th>' +
      '<th style="width: 46px;">GRP</th>' +
      '<th>VARIATION TITLE &amp; HYPOTHESIS</th>' +
      '<th style="width: 118px;">GUIDANCE (CFG)</th>' +
      '<th style="width: 92px;">SAMPLER</th>' +
      '<th style="width: 104px;">DSP / SEED</th>' +
      '<th style="width: 98px;">METRICS</th>' +
      '<th style="width: 84px;">ACTIONS</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var r = getRatingEntry(v.id);
      var isSel = v.id === state.selectedId;
      var isPin = v.id === state.pinnedAId;
      var m = v.metrics;

      var rowCls = [];
      if (isSel) rowCls.push('is-selected');
      if (isPin) rowCls.push('is-pinned-a');

      var metricsCell = m
        ? '<span class="mono" style="font-size:11px;">S:' + fmtNum(m.sub_rms, 3) + ' P:' + fmtNum(m.pause_rms, 4) + '</span>'
        : '<span class="mono" style="font-size:10px; color:var(--ink-faint);">PENDING</span>';

      var noteBadge = r.note
        ? ' <span class="tag-box" title="' + escapeHtml(r.note) + '">NOTE</span>'
        : '';

      html += '<tr class="' + rowCls.join(' ') + '" data-var-id="' + escapeHtml(v.id) + '">' +
        '<td class="mono" style="font-weight:700;">#' + pad3(v.index) + '</td>' +
        '<td><span class="tag-box">' + escapeHtml(v.group_id) + '</span></td>' +
        '<td>' +
          '<div style="font-weight:700; color:var(--ink-primary);">' + escapeHtml(v.title) + noteBadge + '</div>' +
          '<div style="font-size:11px; color:var(--ink-muted); margin-top:2px;">' + escapeHtml(v.hypothesis) + '</div>' +
        '</td>' +
        '<td class="mono" style="font-size:11px;">' +
          '<div><strong>' + escapeHtml(v.guidance_mode) + '</strong></div>' +
          '<div style="color:var(--ink-muted);">CFG ' + v.cfg_scale.toFixed(2) + ' | ' + escapeHtml(v.neg_key) + '</div>' +
        '</td>' +
        '<td class="mono" style="font-size:11px;">' +
          '<div>' + escapeHtml(v.sampler_name) + ' (' + v.n_steps + 's)</div>' +
          '<div style="color:var(--ink-muted);">V:' + v.shift_video + ' A:' + v.shift_audio + '</div>' +
        '</td>' +
        '<td class="mono" style="font-size:11px;">' +
          '<div>' + escapeHtml(v.dsp_mode) + '</div>' +
          '<div style="color:var(--ink-muted);">seed ' + v.seed + '</div>' +
        '</td>' +
        '<td>' + metricsCell + '</td>' +
        '<td onclick="event.stopPropagation();">' +
          '<div class="row-actions">' +
            '<button type="button" class="mini-btn ' + (r.status === 'STARRED' ? 'is-star' : '') + '" data-action="star" data-id="' + v.id + '" title="Star (S)">*</button>' +
            '<button type="button" class="mini-btn ' + (r.status === 'REJECTED' ? 'is-reject' : '') + '" data-action="reject" data-id="' + v.id + '" title="Reject (X)">X</button>' +
            '<button type="button" class="mini-btn ' + (isPin ? 'is-pin' : '') + '" data-action="pin" data-id="' + v.id + '" title="Pin as Reference A (P)">A</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }

    html += '</tbody></table>';
    dom.catalogContainer.innerHTML = html;
  }

  function renderCatalogGrid(list) {
    var html = '<div class="var-cards-grid">';
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var r = getRatingEntry(v.id);
      var isSel = v.id === state.selectedId;
      var isPin = v.id === state.pinnedAId;
      var m = v.metrics;

      var cls = ['var-card'];
      if (isSel) cls.push('is-selected');
      if (isPin) cls.push('is-pinned-a');

      html += '<div class="' + cls.join(' ') + '" data-var-id="' + escapeHtml(v.id) + '">' +
        '<div>' +
          '<div class="card-top-row">' +
            '<span><strong>#' + pad3(v.index) + '</strong> [' + escapeHtml(v.group_id) + ']</span>' +
            '<div class="row-actions" onclick="event.stopPropagation();">' +
              '<button type="button" class="mini-btn ' + (r.status === 'STARRED' ? 'is-star' : '') + '" data-action="star" data-id="' + v.id + '">*</button>' +
              '<button type="button" class="mini-btn ' + (r.status === 'REJECTED' ? 'is-reject' : '') + '" data-action="reject" data-id="' + v.id + '">X</button>' +
              '<button type="button" class="mini-btn ' + (isPin ? 'is-pin' : '') + '" data-action="pin" data-id="' + v.id + '">A</button>' +
            '</div>' +
          '</div>' +
          '<div style="font-weight:700; font-size:13px; margin-top:6px;">' + escapeHtml(v.title) + '</div>' +
          '<div style="font-size:11px; color:var(--ink-muted); margin-top:4px;">' + escapeHtml(v.hypothesis) + '</div>' +
        '</div>' +
        '<div class="mono" style="font-size:10px; border-top:1px solid var(--border-hairline); padding-top:6px; display:flex; flex-wrap:wrap; gap:4px;">' +
          '<span class="tag-box">' + escapeHtml(v.guidance_mode) + ' (' + v.cfg_scale.toFixed(2) + ')</span>' +
          '<span class="tag-box">' + escapeHtml(v.sampler_name) + ':' + v.n_steps + '</span>' +
          '<span class="tag-box">' + escapeHtml(v.dsp_mode) + '</span>' +
          '<span class="tag-box">s' + v.seed + '</span>' +
          (m ? '<span class="tag-box is-ready">SUB ' + fmtNum(m.sub_rms, 3) + '</span>' : '') +
        '</div>' +
      '</div>';
    }
    html += '</div>';
    dom.catalogContainer.innerHTML = html;
  }

  function highlightSelectedInCatalog() {
    if (!dom.catalogContainer) return;
    var items = dom.catalogContainer.querySelectorAll('[data-var-id]');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var id = el.dataset.varId;
      el.classList.toggle('is-selected', id === state.selectedId);
      el.classList.toggle('is-pinned-a', id === state.pinnedAId);
      var pinBtn = el.querySelector('[data-action="pin"]');
      if (pinBtn) pinBtn.classList.toggle('is-pin', id === state.pinnedAId);
    }
  }

  function updateCatalogRowNoteIndicator(id) {
    // Lightweight re-render of catalog if needed
    applyFiltersAndRender();
  }

  function scrollCatalogItemIntoView(id) {
    if (!dom.catalogContainer) return;
    var el = dom.catalogContainer.querySelector('[data-var-id="' + id + '"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  // ==========================================================================
  // SHORTLIST JSON EXPORT & KEYBOARD MODAL
  // ==========================================================================
  function openExportShortlistModal() {
    var starred = [];
    var rejected = [];
    var noted = [];

    state.variations.forEach(function (v) {
      var r = getRatingEntry(v.id);
      if (r.status === 'STARRED' || r.status === 'REJECTED' || (r.note && r.note.trim())) {
        var entry = {
          id: v.id,
          index: v.index,
          group_id: v.group_id,
          title: v.title,
          status: r.status,
          note: r.note || '',
          recipe_key: v.recipe_key,
          guidance_mode: v.guidance_mode,
          cfg_scale: v.cfg_scale,
          neg_key: v.neg_key,
          sampler_name: v.sampler_name,
          n_steps: v.n_steps,
          shift_audio: v.shift_audio,
          dsp_mode: v.dsp_mode,
          seed: v.seed,
          metrics: v.metrics || null
        };
        if (r.status === 'STARRED') starred.push(entry);
        if (r.status === 'REJECTED') rejected.push(entry);
        if (r.note && r.note.trim()) noted.push(entry);
      }
    });

    var exportPayload = {
      exported_at: new Date().toISOString(),
      clip_name: state.manifest ? state.manifest.clip_name : '04_knight_glacial_and_sunfire_breathing.mp4',
      summary: {
        starred_count: starred.length,
        rejected_count: rejected.length,
        noted_count: noted.length,
        starred_ids: starred.map(function (x) { return x.id; })
      },
      starred: starred,
      rejected: rejected,
      all_ratings_map: state.ratings
    };

    var jsonStr = JSON.stringify(exportPayload, null, 2);

    dom.modalTitle.textContent = 'EXPORT AUDITION SHORTLIST JSON (' + starred.length + ' STARRED)';
    dom.modalBody.innerHTML =
      '<div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">' +
        '<span class="mono" style="font-size:11px; color:var(--ink-secondary);">Starred: ' + starred.length + ' | Rejected: ' + rejected.length + ' | With Notes: ' + noted.length + '</span>' +
        '<div style="display:flex; gap:6px;">' +
          '<button type="button" class="btn btn-primary" id="btn-modal-copy-json">COPY JSON TO CLIPBOARD</button>' +
          '<button type="button" class="btn btn-accent" id="btn-modal-download-json">DOWNLOAD .JSON FILE</button>' +
        '</div>' +
      '</div>' +
      '<pre class="prompt-pre" style="max-height: 360px; user-select: all;">' + escapeHtml(jsonStr) + '</pre>';

    dom.modalBackdrop.classList.remove('is-hidden');

    var copyBtn = document.getElementById('btn-modal-copy-json');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(jsonStr).then(function () {
            copyBtn.textContent = 'COPIED TO CLIPBOARD!';
          });
        }
      });
    }

    var dlBtn = document.getElementById('btn-modal-download-json');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'haru-foley-shortlist.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  function openKeysModal() {
    dom.modalTitle.textContent = 'KEYBOARD SHORTCUTS & STUDIO PROTOCOL';
    dom.modalBody.innerHTML =
      '<table class="ab-table">' +
      '<thead><tr><th>KEY</th><th>ACTION</th></tr></thead>' +
      '<tbody>' +
      '<tr><td><strong>J</strong> or <strong>Right Arrow</strong></td><td>Next variation in filtered list</td></tr>' +
      '<tr><td><strong>K</strong> or <strong>Left Arrow</strong></td><td>Previous variation in filtered list</td></tr>' +
      '<tr><td><strong>Space</strong></td><td>Play / Pause current video stage</td></tr>' +
      '<tr><td><strong>1 / 2 / 3 / 4</strong></td><td>Jump immediately to Beat 1 / 2 / 3 / 4 and loop that beat</td></tr>' +
      '<tr><td><strong>0</strong></td><td>Release single-beat loop and play full 5.875s clip</td></tr>' +
      '<tr><td><strong>R</strong></td><td>Instant toggle: Polished (.mp4) vs Raw 32kHz AudioVAE (.mp3) locked to currentTime</td></tr>' +
      '<tr><td><strong>S</strong></td><td>Star / Favorite current variation (persisted to localStorage)</td></tr>' +
      '<tr><td><strong>X</strong></td><td>Reject current variation</td></tr>' +
      '<tr><td><strong>P</strong></td><td>Pin / Unpin current variation as Reference [A] for A/B comparison</td></tr>' +
      '<tr><td><strong>C</strong></td><td>Flip stage playback between [Play A] and [Play B] at exact same timestamp</td></tr>' +
      '<tr><td><strong>M</strong></td><td>Toggle Marathon Mode (auto-advances to next variation when clip ends)</td></tr>' +
      '</tbody></table>';
    dom.modalBackdrop.classList.remove('is-hidden');
  }

  function escapeHtml(s) {
    return cleanDashes(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================
  function bindEvents() {
    // Video events
    dom.video.addEventListener('play', function () {
      state.isPlaying = true;
      dom.btnPlayPause.innerHTML = 'PAUSE <span class="kbd-hint">SPACE</span>';
      syncAudioModeToElements();
    });

    dom.video.addEventListener('pause', function () {
      state.isPlaying = false;
      dom.btnPlayPause.innerHTML = 'PLAY <span class="kbd-hint">SPACE</span>';
      if (dom.rawAudio) dom.rawAudio.pause();
    });

    dom.video.addEventListener('seeking', function () {
      if (state.audioMode === 'raw' && dom.rawAudio && dom.rawAudio.readyState >= 1) {
        try {
          dom.rawAudio.currentTime = dom.video.currentTime;
        } catch (e) {}
      }
      updatePlayheadUI();
    });

    dom.video.addEventListener('timeupdate', updatePlayheadUI);

    dom.video.addEventListener('ended', function () {
      var beat = getBeatById(state.activeBeatId);
      if (beat) {
        seekStageTo(beat.start_s, true);
        return;
      }
      if (state.marathonMode) {
        stepVariation(1);
      } else {
        seekStageTo(0, true);
      }
    });

    dom.video.addEventListener('error', function () {
      var v = getStageActiveVariation();
      dom.videoStatusOverlay.classList.remove('is-hidden');
      dom.videoStatusTitle.textContent = 'VIDEO PENDING GPU RENDER';
      dom.videoStatusSub.textContent = v
        ? ('File not yet written: ' + v.video_Path + ' (Variation #' + pad3(v.index) + ')')
        : 'Video file unavailable';
    });

    dom.btnRetryVideo.addEventListener('click', function () {
      var v = getStageActiveVariation();
      if (v) loadVariationOnStage(v, false, true);
    });

    dom.btnSkipNext.addEventListener('click', function () {
      stepVariation(1);
    });

    // Beat buttons
    var beatBtns = document.querySelectorAll('.beat-btn');
    for (var i = 0; i < beatBtns.length; i++) {
      beatBtns[i].addEventListener('click', function (ev) {
        var bid = ev.currentTarget.dataset.beatId;
        if (bid !== 'ALL' && state.activeBeatId === bid) {
          // Clicking active beat again releases loop back to ALL
          selectBeatLoop('ALL', false);
        } else {
          selectBeatLoop(bid, true);
        }
      });
    }

    // Transport buttons
    dom.btnPrev.addEventListener('click', function () { stepVariation(-1); });
    dom.btnNext.addEventListener('click', function () { stepVariation(1); });
    dom.btnPlayPause.addEventListener('click', togglePlayPause);

    dom.btnMarathon.addEventListener('click', function () {
      state.marathonMode = !state.marathonMode;
      dom.btnMarathon.classList.toggle('is-active', state.marathonMode);
      dom.btnMarathon.innerHTML = 'MARATHON: ' + (state.marathonMode ? 'ON' : 'OFF') + ' <span class="kbd-hint">M</span>';
    });

    dom.btnModePolished.addEventListener('click', function () { setAudioMode('polished'); });
    dom.btnModeRaw.addEventListener('click', function () { setAudioMode('raw'); });

    dom.btnStarCur.addEventListener('click', function () { setRatingStatus(state.selectedId, 'STARRED'); });
    dom.btnRejectCur.addEventListener('click', function () { setRatingStatus(state.selectedId, 'REJECTED'); });
    dom.btnPinA.addEventListener('click', function () { togglePinA(state.selectedId); });
    dom.btnPinAInline.addEventListener('click', function () { togglePinA(state.selectedId); });

    // A/B Controls
    dom.btnPlayA.addEventListener('click', function () { switchAbPlayback('A'); });
    dom.btnPlayB.addEventListener('click', function () { switchAbPlayback('B'); });
    dom.btnClearA.addEventListener('click', function () {
      state.pinnedAId = null;
      state.abActiveTarget = 'B';
      var v = getVariationById(state.selectedId);
      if (v) loadVariationOnStage(v, true, state.isPlaying);
      highlightSelectedInCatalog();
      renderInspector();
    });

    // Note input
    dom.inspNoteInput.addEventListener('input', function (ev) {
      setRatingNote(state.selectedId, ev.target.value);
    });

    // Prompt tabs
    dom.btnTabPosPrompt.addEventListener('click', function () {
      state.promptTab = 'pos';
      renderPromptBox(getVariationById(state.selectedId));
    });
    dom.btnTabNegPrompt.addEventListener('click', function () {
      state.promptTab = 'neg';
      renderPromptBox(getVariationById(state.selectedId));
    });

    // Filter strips delegation
    dom.filterGroupStrip.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-group]');
      if (!btn) return;
      state.filters.group = btn.dataset.group;
      var all = dom.filterGroupStrip.querySelectorAll('.filter-chip');
      for (var k = 0; k < all.length; k++) all[k].classList.toggle('is-active', all[k] === btn);
      applyFiltersAndRender();
    });

    dom.filterGuidanceStrip.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-guidance]');
      if (!btn) return;
      state.filters.guidance = btn.dataset.guidance;
      var all = dom.filterGuidanceStrip.querySelectorAll('.filter-chip');
      for (var k = 0; k < all.length; k++) all[k].classList.toggle('is-active', all[k] === btn);
      applyFiltersAndRender();
    });

    dom.filterRatingStrip.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-rating]');
      if (!btn) return;
      state.filters.rating = btn.dataset.rating;
      var all = dom.filterRatingStrip.querySelectorAll('.filter-chip');
      for (var k = 0; k < all.length; k++) all[k].classList.toggle('is-active', all[k] === btn);
      applyFiltersAndRender();
    });

    dom.filterDspSelect.addEventListener('change', function (ev) {
      state.filters.dsp = ev.target.value;
      applyFiltersAndRender();
    });

    dom.searchInput.addEventListener('input', function (ev) {
      state.filters.search = ev.target.value;
      applyFiltersAndRender();
    });

    dom.sortSelect.addEventListener('change', function (ev) {
      state.filters.sort = ev.target.value;
      applyFiltersAndRender();
    });

    dom.btnViewTable.addEventListener('click', function () {
      state.viewMode = 'table';
      dom.btnViewTable.classList.add('is-active');
      dom.btnViewGrid.classList.remove('is-active');
      renderCatalog();
    });

    dom.btnViewGrid.addEventListener('click', function () {
      state.viewMode = 'grid';
      dom.btnViewGrid.classList.add('is-active');
      dom.btnViewTable.classList.remove('is-active');
      renderCatalog();
    });

    dom.btnResetFilters.addEventListener('click', function () {
      state.filters = {
        group: 'ALL',
        guidance: 'ALL',
        rating: 'ALL',
        dsp: 'ALL',
        search: '',
        sort: 'index_asc'
      };
      dom.searchInput.value = '';
      dom.sortSelect.value = 'index_asc';
      dom.filterDspSelect.value = 'ALL';

      var strips = [dom.filterGroupStrip, dom.filterGuidanceStrip, dom.filterRatingStrip];
      strips.forEach(function (st) {
        var chips = st.querySelectorAll('.filter-chip');
        for (var c = 0; c < chips.length; c++) {
          chips[c].classList.toggle('is-active', c === 0);
        }
      });
      applyFiltersAndRender();
    });

    // Catalog row/card clicks
    dom.catalogContainer.addEventListener('click', function (ev) {
      var actionBtn = ev.target.closest('[data-action]');
      if (actionBtn) {
        var act = actionBtn.dataset.action;
        var tid = actionBtn.dataset.id;
        if (act === 'star') setRatingStatus(tid, 'STARRED');
        if (act === 'reject') setRatingStatus(tid, 'REJECTED');
        if (act === 'pin') togglePinA(tid);
        return;
      }
      var row = ev.target.closest('[data-var-id]');
      if (row) {
        selectVariation(row.dataset.varId, true);
      }
    });

    // Top bar actions
    dom.btnRefreshManifest.addEventListener('click', function () {
      fetchLatestManifestJson(true);
    });

    dom.btnAutopoll.addEventListener('click', function () {
      if (state.autoPollTimer) {
        clearInterval(state.autoPollTimer);
        state.autoPollTimer = null;
        dom.btnAutopoll.classList.remove('is-active');
        dom.btnAutopoll.textContent = 'AUTO-SYNC: OFF';
      } else {
        fetchLatestManifestJson(false);
        state.autoPollTimer = setInterval(function () {
          fetchLatestManifestJson(false);
        }, 5000);
        dom.btnAutopoll.classList.add('is-active');
        dom.btnAutopoll.textContent = 'AUTO-SYNC: 5s ON';
      }
    });

    dom.btnExportShortlist.addEventListener('click', openExportShortlistModal);
    dom.btnKeysModal.addEventListener('click', openKeysModal);

    dom.btnCloseModal.addEventListener('click', function () {
      dom.modalBackdrop.classList.add('is-hidden');
    });
    dom.modalBackdrop.addEventListener('click', function (ev) {
      if (ev.target === dom.modalBackdrop) {
        dom.modalBackdrop.classList.add('is-hidden');
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', function (ev) {
      var tag = ev.target && ev.target.tagName ? ev.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (ev.key === 'Escape') {
          ev.target.blur();
        }
        return;
      }

      if (ev.key === 'Escape') {
        dom.modalBackdrop.classList.add('is-hidden');
        return;
      }

      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      var k = ev.key;
      if (k === ' ' || ev.code === 'Space') {
        ev.preventDefault();
        togglePlayPause();
      } else if (k === 'j' || k === 'J' || k === 'ArrowRight') {
        ev.preventDefault();
        stepVariation(1);
      } else if (k === 'k' || k === 'K' || k === 'ArrowLeft') {
        ev.preventDefault();
        stepVariation(-1);
      } else if (k === 's' || k === 'S') {
        ev.preventDefault();
        setRatingStatus(state.selectedId, 'STARRED');
      } else if (k === 'x' || k === 'X') {
        ev.preventDefault();
        setRatingStatus(state.selectedId, 'REJECTED');
      } else if (k === 'r' || k === 'R') {
        ev.preventDefault();
        toggleAudioMode();
      } else if (k === 'p' || k === 'P') {
        ev.preventDefault();
        togglePinA(state.selectedId);
      } else if (k === 'c' || k === 'C') {
        ev.preventDefault();
        switchAbPlayback();
      } else if (k === 'm' || k === 'M') {
        ev.preventDefault();
        dom.btnMarathon.click();
      } else if (k === '1') {
        ev.preventDefault();
        selectBeatLoop('B1', true);
      } else if (k === '2') {
        ev.preventDefault();
        selectBeatLoop('B2', true);
      } else if (k === '3') {
        ev.preventDefault();
        selectBeatLoop('B3', true);
      } else if (k === '4') {
        ev.preventDefault();
        selectBeatLoop('B4', true);
      } else if (k === '0') {
        ev.preventDefault();
        selectBeatLoop('ALL', true);
      } else if (k === '?') {
        ev.preventDefault();
        openKeysModal();
      }
    });
  }

  // ==========================================================================
  // BOOTSTRAP
  // ==========================================================================
  function init() {
    cacheDom();
    loadRatings();
    bindEvents();
    startRafPlayheadLoop();

    if (window.FOLEY_MANIFEST) {
      ingestManifestData(window.FOLEY_MANIFEST, false);
    }

    // Attempt live fetch of ./manifest.json in case GPU runner has updated metrics
    fetchLatestManifestJson(false);

    var initialVar = getVariationById(state.selectedId);
    if (initialVar) {
      loadVariationOnStage(initialVar, false, false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
