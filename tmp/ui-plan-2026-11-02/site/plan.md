# Haru-machi: sculpted UI design study

Status: proposal for discussion. 2026-11-02. Temporary files only; no game implementation or approval implied.

## Intent

Make the UI feel like small objects from the valley without covering the valley. Start with health, your partner, owned abilities and moment-specific feedback. Do not copy the reference image's minimap, clock, RPG menus or large frames.

## Visual rules

- Shallow carved stone, narrow brass accents, jade life fills and a restrained blossom motif.
- Real mesh depth; fixed screen-edge anchors. No continual spinning, bobbing or movement tied to screen shake.
- Distinct icon silhouettes; color is secondary information.
- Compact visual art with larger transparent accessible touch targets.
- Crisp text stays readable; do not turn subtitles into tilted 3D sculpture.
- World-space UI only for nearby interactions or a partner direction cue.

## Information and states

Desktop: two quiet life indicators, E partner skill, Q shared ultimate, R prayer, and 1–4 spells for Mage only. Mouse attack, dodge and jump do not need permanent illustrated buttons once learned. Pause opens audio, controls, camera comfort and leave-room choices.

Tablet: preserve the same abilities, adding reachable strike, evade and jump plus a floating joystick. Secondary target sizes at least 48 CSS px; primary strike 64–80 CSS px. Avoid overlap with the four Mage spells. Heavy-attack gesture and hold-to-continue attacks need one explicit compatible rule before implementation.

Exploration: subdued edges; prompt only near an interaction. Combat: damaged health, cooldowns, infusion and relevant boss/wave status. Prayer: one speaker, one compact status, one shared ceremony. Downed partner: unmistakable health change and direction cue. Connection problems: brief clear recovery message. No permanent stack of banners.

## Proposed prayer contract

Server resolves one owner for each ceremony: idle → recording → judging → response → idle. Concurrent press cannot replace the owner or open another microphone. Use one prayer ID and one result application across clients. Release submits, deliberate move/dodge cancels recording. Disconnect or a bounded timeout cancels safely. Late cancelled results are ignored. Technical failures do not punish. The partner keeps control of their own hero. Values and timeout duration must be approved before implementation.

Simple heal: small grounded lotus, short recipient ribbon, health feedback, no levitation or screen shake. Blessing develops the lotus and sends power into weapons. Miracle earns full sky-scale spectacle. These are visual proposals, not changes to current rewards.

## Current power sources to represent

Mage Frost Lance and Shatterlance normally grant 12s ice/water sword; Cinder Fall grants fire; Storm Lance grants lightning. Partner infusion cycles ordinary styles. Blessing grants mixed fire/water for 22s, miracle for 30s; ultimate normally 16s. Ordinary infusions replacing mixed sword is a current conflict to resolve. Buff expiry must clear every related damage flag. Do not rebalance numbers in a UI task.

## Production gates

1. Approve role/state layouts and resolve hold/charge and prayer ownership decisions.
2. Block out HUD meshes in the actual game with an orthographic HUD camera using the existing renderer; align transparent HTML hit targets and accessible labels.
3. Build the small reusable token family under the project asset workflow, shared geometry/materials/atlas, measured against complete-scene budgets. The temporary page's separate renderer and draw count are not the proposed production implementation.
4. Wire truthful health, cooldown, infusion, resonance and ceremony state. Test event IDs, concurrent presses, disconnects, buff expiry and role ownership across both clients.
5. Capture live desktop 1600×900 and tablet 1440×960 sequences, physically check Pad 7 reach/readability and actual performance. Complete fresh blind review and user approval before a stage-quality commit.

## Provenance and limits

The generated concept uses the user's attached visual reference and a historical actual village capture. It changes scene details and is not a literal asset target or implementation screenshot. The other images are historical captures. Built-in image generation was used, not a fallback provider.

The interactive study renders real procedural UI meshes with Three.js 0.170.0. It has no game connection, microphone, judging service or live co-op. Timings and responses are illustrative. No secret name, riddle, environment file or runtime credentials are included. Only the site directory is uploaded.
