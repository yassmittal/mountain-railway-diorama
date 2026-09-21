An interactive miniature Japanese mountain railway with a local train that winds through a gorge, bridge, tunnel, station, shrine, river and waterfall across day, evening, rain and night. 

Live demo: https://iamtechartist.github.io/mountain-railway-diorama/

## Brainrot Express (game mode)

This copy turns the diorama into a driving game. It opens on a title screen over the cinematic camera; `?diorama=1` gives back the original calm diorama.

**Loop:** you drive the train. Stop the nose of the train on each stop's glowing line to board the brainrot passenger waiting there. The closer the stop, the more aura: PERFECT (≤0.6 m) → GREAT → MID → SLOPPY (≤5 m). Every stop buys clock time, and clean stops chain a combo multiplier. Overshoot by 6 m and the passenger is left on read. The shift ends when the clock hits zero, and your best score is kept in `localStorage`.

**Pressure:** curves have speed limits (the HUD shows the current limit and the next lower one ahead). Sustained overspeed fills a derail meter, the cars tip, and you lose aura and time. Speed orbs pay out only above 90 km/h. Weather rotates each lap (golden hour → rain, where braking is weaker → night → day).

**Controls:** `W`/`↑` go, `S`/`↓` brake, `Space` horn (honking at the waiting passenger is +15 aura), `C` camera (chase / nose / drone), `P`/`Esc` pause, `M` mute. On touch screens: on-screen GO / BRAKE / horn buttons.

| File | Role |
| --- | --- |
| `game.js` | Game flow, stops, orbs, input, chase camera, HUD. Hooks into `main.js` via `trainOptions()`, `update()`, `updateCamera()` |
| `rules.js` | Pure scoring/tuning (grades, combo, curve limits, weather per lap, ranks). Tested by `npm test` |
| `brainrot.js` | The cast: seven procedural characters built from primitives, plus waypoint name labels. Add one by appending to `ROSTER` |
| `sound.js` | All audio synthesized with WebAudio (engine, rail clack, brake squeal, horn, boom, beat); no audio files |
| `game.css` | Title, HUD, pause and results screens |
| `train.js` | Gains a manual mode (`opts.manual`, `throttle`, `brake`, `lean`) and `place()`; autopilot is unchanged |

`window.yamaai.game.debug()` returns live game state in the browser console.

Run: `npm run dev` (serves on http://localhost:8000). Test: `npm test`.
# mountain-railway-diorama
# mountain-railway-diorama
