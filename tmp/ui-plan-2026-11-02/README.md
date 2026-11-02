# Temporary Haru-machi UI study

Public URL: https://haru-ui-study-20261102.pages.dev/

Final deployment: https://a2449847.haru-ui-study-20261102.pages.dev

Only `site/` was uploaded. Source, deployment configuration and local cache live in this temporary folder; no game files were edited. No commit was created. The earlier `docs/visual-plan/` artifact was left untouched.

## Contents

- `site/index.html`: image-led mobile-first design guide.
- `site/app.js`: actual Three.js 3D HUD token prototype, role/input/state controls, demonstration-only prayer feedback.
- `site/style.css`: responsive document and accessible DOM hit areas.
- `site/plan.md`: written scope, production gates, current versus proposed behavior.
- `site/assets/sculpted-hud-concept.png`: built-in imagegen concept using the supplied reference plus historical actual village image. Scene details are illustrative, not evidence of game changes.
- Actual village and historical tablet HUD captures; local Three.js 0.170.0 with license.

## Generation brief

Generate a restrained final gameplay HUD concept for the romantic two-player valley game. Reference the supplied sculpted UI image for material integration and actual village screenshot for low-poly KayKit fidelity. Preserve the village, well, shrine and two heroes; leave at least 85 percent of the view unobstructed. Remove minimap, clock/day counter, giant location sign, quest parchment, inventory, mana, portraits, decorative vine frames and developer tools. Use small shallow carved stone controls, narrow aged-brass edges, jade life fills, a restrained blossom motif and readable silhouettes. Two compact health bars, role-appropriate elemental sigils, partner skill, shared ultimate, commune and pause; no deity proper name or secret clues. Screen-edge objects have real-looking depth and matching warm light. Do not treat the resulting icon layout or changed scenery as a literal implementation target.

The guide's role-specific layouts refine the image: desktop movement/strike buttons disappear; tablet adds reachable touch actions. No game state or balance was changed.

## Verification performed

- JavaScript syntax check passes.
- Static checker resolves all 14 document links/assets/anchors and excludes deployment config, environment files and logs from the public folder.
- HTML preview render at 390 CSS px shows the mobile document without horizontal overflow; separate 1100 px preview inspects actual 3D rendering.
- Runtime checks pass: WebGL produces draws; Knight desktop has 3 ability tokens, Mage desktop 7, Mage tablet 10; hit areas stay within the demo; concurrent prayer demonstration stays blocked; pause opens/closes; depth slider updates scene state; reset restores depth; no horizontal overflow.
- Fixed a tablet health/joystick overlap found in the render. Tablet health now sits upper left.
- After final deployment, all 9 public assets exactly match local SHA-256 hashes; permission header disables microphone, camera and geolocation.

## Limits

The computer-use browser host was unavailable. HTML preview provided browser rendering and interaction-script verification instead. Its software WebGL warnings are not physical-device measurements. Actual Pad 7 reach, full-game frame budgets and blind visual gate remain future production checks. The generated image is a concept; HTML prototype is not playable gameplay. This Pages project is not configured for automatic expiry.
