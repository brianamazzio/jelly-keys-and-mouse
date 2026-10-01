# Assets

Every object in the scene is a found model. The only generated geometry is the room shell (floor and
three walls), which are plain boxes. Sources are in two groups: the keyboard, mouse and monitor (CC BY,
Sketchfab via Objaverse), and the room and desk objects (CC0, Poly Haven, further down).

Both hardware models are **found assets** (not modelled from scratch), sourced through the
[Objaverse](https://objaverse.allenai.org/) index of Creative-Commons Sketchfab models and then
inspected and cleaned in Blender. Only the processed GLBs in `public/models/` ship with the project.

Before choosing, the Objaverse LVIS categories `computer_keyboard` (99 models) and
`mouse_(computer_equipment)` (47 models) were pulled, every candidate's Sketchfab metadata
(licence, author, face count) was fetched, thumbnails were reviewed on a contact sheet, and the
14 most promising GLBs were downloaded and rendered as clay in headless Blender to inspect the
actual geometry (topology, part separation, scale, proportions). No finished "jelly" or "gummy"
keyboard/mouse models exist in these free catalogues (Poly Haven and ambientCG have neither
object at all), so conventional product models were adapted.

## Keyboard — "Keyboard 75%"

| | |
|---|---|
| Author | kennypang (Sketchfab) |
| Source | <https://sketchfab.com/3d-models/keyboard-75-d859eb1b182d46dbad4e1cdefd8255b4> |
| Licence | **CC Attribution 4.0** (CC BY) — attribution required, commercial use allowed |
| Original | 22,600 triangles, 2 meshes (all keycaps in one mesh, case in another), no textures |
| Objaverse UID | `d859eb1b182d46dbad4e1cdefd8255b4` |

Why this one: proper Cherry-profile keycaps with cylindrical top dish and chamfered edges, a full
84-key 75% layout with correct 19.05 mm pitch and modifier widths, and clean rounded case.

Cleanup performed (`tools/process_assets.py`, headless Blender 4.x):

- separated the two source meshes into 84 individual keycaps + case + base plate (18 caps were
  stored inside the case mesh; all 84 recovered by loose-part separation)
- assigned every cap its `KeyboardEvent.code` name (`key_KeyA` …) from measured row/column bounds
- recovered quads from the glTF triangulation, then subdivided caps (Catmull-Clark, 1 level →
  ~1,600 tris each) so the vertex-shader deformation is smooth and reflections stay clean
- rescaled to metres (19.05 mm pitch), centred, rested on y = 0
- legends are **not** from the asset: they are authored at runtime into a canvas atlas
  (Inter Tight, OFL) and mapped onto each cap by its footprint

## Mouse — "Computer Mouse"

| | |
|---|---|
| Author | PoneMyintMyat (Sketchfab) |
| Source | <https://sketchfab.com/3d-models/computer-mouse-836aa5c61155474fba05ec15a8a29410> |
| Licence | **CC Attribution 4.0** (CC BY) — attribution required, commercial use allowed |
| Original | 35,320 triangles, 5 meshes (top shell, lower body, mid band, wheel, wheel housing), no textures |
| Objaverse UID | `836aa5c61155474fba05ec15a8a29410` |

Why this one: a familiar, unbranded modern office mouse with a real button seam on the shell and a
separate scroll wheel; parts are already split, so the top shell can deform while the rest stays put.

Cleanup performed:

- renamed parts (`shell`, `body`, `band`, `wheel`, `wheel_housing`)
- welded the shell, body and band (each was a patchwork of 125–238 separate surface pieces),
  recovered quads, then Catmull-Clark subdivided them once
- rescaled to metres (115 mm long), centred, rested on y = 0
- moved the wheel's origin to its axle so it can spin; at runtime it is drawn 1.3× and lifted
  1.2 mm so the jelly wheel reads clearly (the source nub is very small)

## Computer monitor — "Monitor"

| | |
|---|---|
| Author | ElectroDbstp (Sketchfab) |
| Source | <https://sketchfab.com/3d-models/monitor-24e471ac730f40fcb0501930a83784be> |
| Licence | **CC Attribution 4.0** (CC BY) — attribution required, commercial use allowed |
| Original | 5,026 triangles, 4 meshes (panel, stand with base, mount, a small detail), no textures |
| Objaverse UID | `24e471ac730f40fcb0501930a83784be` |

Why this one: of 126 monitors in the Objaverse `computer_monitor` category, 114 were CC BY; 12 were
downloaded and inspected as clay renders in Blender. This is a clean, unbranded modern flat panel with a
thin bezel, a tilted stand and port details on the back, in proportion with the keyboard. (The strongest
alternative was an Apple iMac model, rejected for its branding and 170,000 triangles.)

Cleanup: scaled to 0.60 m wide (a 27-inch class monitor), origin at the centre of its base, exported
material-less by `tools/process_room_assets.py`. The lit screen is a shader effect on the panel's
front faces inside the bezel line, not added geometry. Source kept in `tools/source/`.

## Room and desk objects — Poly Haven (CC0)

All 41 models below come from [Poly Haven](https://polyhaven.com/models), licence **CC0** (public domain,
no attribution required; credited here anyway). Each link is the asset's page, which names its author.
Only the geometry is used: textures were not downloaded, since everything is re-materialled as jelly.

The catalogue (about 400 models) was listed through the Poly Haven API, 38 candidates were downloaded, and
every one was opened in headless Blender for size, part structure, triangle count and a clay render before
choosing. Several sources are multi-object sets (tea set, chess set, encyclopedia set, stationery), from
which individual objects were taken.

Cleanup performed (`tools/process_room_assets.py`, headless Blender 4.x): pick the named parts, join them,
scale to a believable desk-object size (several scans are larger than life), decimate the two heaviest
(floor plant, gnome), set the origin (loose objects: bounds centre; furniture: floor centre), export one
material-less GLB each. The unmodified source geometry is kept in `tools/source/polyhaven/`.

| Item | Poly Haven source | Role | Scale | Final size, cm (w × h × d) | Triangles |
|---|---|---|---|---|---|
| `duck` | [rubber_duck_toy](https://polyhaven.com/a/rubber_duck_toy) | pick up | 0.3 | 6 × 9 × 9 | 4,288 |
| `apple` | [food_apple_01](https://polyhaven.com/a/food_apple_01) | pick up | 0.8 | 8 × 7 × 8 | 7,012 |
| `lemon` | [lemon](https://polyhaven.com/a/lemon) | pick up | 0.85 | 6 × 8 × 6 | 4,012 |
| `croissant` | [croissant](https://polyhaven.com/a/croissant) | pick up | 0.7 | 14 × 4 × 5 | 1,990 |
| `baseball` | [baseball_01](https://polyhaven.com/a/baseball_01) | pick up | 1.0 | 7 × 8 × 8 | 10,848 |
| `alarmclock` | [alarm_clock_01](https://polyhaven.com/a/alarm_clock_01) | pick up | 0.75 | 10 × 13 × 5 | 8,985 |
| `stapler` | [vintage_stapler](https://polyhaven.com/a/vintage_stapler) | pick up | 0.8 | 17 × 8 × 4 | 4,370 |
| `succulent` | [potted_plant_04](https://polyhaven.com/a/potted_plant_04) | pick up | 0.55 | 9 × 15 × 10 | 8,929 |
| `lightbulb` | [lightbulb_01](https://polyhaven.com/a/lightbulb_01) | pick up | 1.0 | 6 × 10 × 6 | 4,372 |
| `magnifier` | [magnifying_glass_01](https://polyhaven.com/a/magnifying_glass_01) | pick up | 0.75 | 10 × 20 × 2 | 7,240 |
| `spectacles` | [round_spectacles](https://polyhaven.com/a/round_spectacles) | pick up | 0.9 | 14 × 4 × 13 | 11,810 |
| `thermos` | [plastic_thermos](https://polyhaven.com/a/plastic_thermos) | pick up | 0.7 | 10 × 22 × 8 | 5,514 |
| `cake` | [carrot_cake](https://polyhaven.com/a/carrot_cake) | pick up | 0.6 | 14 × 6 × 14 | 13,790 |
| `cat` | [concrete_cat_statue](https://polyhaven.com/a/concrete_cat_statue) | pick up | 0.45 | 7 × 13 × 11 | 11,950 |
| `gnome` | [garden_gnome](https://polyhaven.com/a/garden_gnome) | pick up | 0.3 | 8 × 18 × 6 | 14,000 |
| `teapot` | [tea_set_01](https://polyhaven.com/a/tea_set_01) | pick up | 0.7 | 12 × 12 × 19 | 12,144 |
| `teacup` | [tea_set_01](https://polyhaven.com/a/tea_set_01) | pick up | 0.8 | 9 × 5 × 11 | 4,156 |
| `pencilcup` | [stationery_supplies](https://polyhaven.com/a/stationery_supplies) | pick up | 1.0 | 8 × 8 × 8 | 768 |
| `pen_a` | [stationery_supplies](https://polyhaven.com/a/stationery_supplies) | pick up | 1.0 | 13 × 1 × 1 | 1,339 |
| `pen_b` | [stationery_supplies](https://polyhaven.com/a/stationery_supplies) | pick up | 1.0 | 16 × 1 × 1 | 721 |
| `book_a` | [book_encyclopedia_set_01](https://polyhaven.com/a/book_encyclopedia_set_01) | pick up | 0.8 | 3 × 19 × 13 | 3,392 |
| `book_b` | [book_encyclopedia_set_01](https://polyhaven.com/a/book_encyclopedia_set_01) | pick up | 0.8 | 1 × 19 × 13 | 3,364 |
| `book_c` | [book_encyclopedia_set_01](https://polyhaven.com/a/book_encyclopedia_set_01) | pick up | 0.8 | 2 × 19 × 13 | 3,364 |
| `king` | [chess_set](https://polyhaven.com/a/chess_set) | pick up | 1.0 | 4 × 10 × 4 | 4,172 |
| `rook` | [chess_set](https://polyhaven.com/a/chess_set) | pick up | 1.0 | 4 × 6 × 4 | 2,976 |
| `knight` | [chess_set](https://polyhaven.com/a/chess_set) | pick up | 1.0 | 4 × 8 × 5 | 2,662 |
| `cassette` | [cassette_player](https://polyhaven.com/a/cassette_player) | pick up | 1.0 | 13 × 24 × 5 | 4,830 |
| `binder` | [binder_notebook](https://polyhaven.com/a/binder_notebook) | pick up | 0.9 | 15 × 2 × 18 | 9,056 |
| `goblet` | [brass_goblets](https://polyhaven.com/a/brass_goblets) | pick up | 0.45 | 7 × 12 × 7 | 3,072 |
| `frame` | [standing_picture_frame_01](https://polyhaven.com/a/standing_picture_frame_01) | pick up | 0.7 | 7 × 17 × 14 | 1,634 |
| `vase` | [ceramic_vase_01](https://polyhaven.com/a/ceramic_vase_01) | pick up | 0.5 | 10 × 20 × 10 | 10,296 |
| `desk` | [metal_office_desk](https://polyhaven.com/a/metal_office_desk) | room | 1.0 | 200 × 79 × 95 | 6,898 |
| `chair` | [modern_arm_chair_01](https://polyhaven.com/a/modern_arm_chair_01) | room | 1.0 | 82 × 102 × 99 | 8,916 |
| `bookshelf` | [wooden_bookshelf_worn](https://polyhaven.com/a/wooden_bookshelf_worn) | room | 1.0 | 137 × 206 × 58 | 10,106 |
| `floorplant` | [potted_plant_01](https://polyhaven.com/a/potted_plant_01) | room | 0.8 | 47 × 108 × 51 | 30,000 |
| `desklamp` | [desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) | room | 0.62 | 13 × 55 × 38 | 24,102 |
| `ceilinglamp` | [modern_ceiling_lamp_01](https://polyhaven.com/a/modern_ceiling_lamp_01) | room | 1.0 | 43 × 95 × 43 | 5,602 |
| `wallclock` | [wall_clock](https://polyhaven.com/a/wall_clock) | room | 1.0 | 32 × 32 × 5 | 3,658 |
| `tallframe` | [hanging_picture_frame_01](https://polyhaven.com/a/hanging_picture_frame_01) | room | 0.75 | 45 × 63 × 1 | 2,586 |
| `wideframe` | [fancy_picture_frame_01](https://polyhaven.com/a/fancy_picture_frame_01) | room | 1.0 | 60 × 46 × 2 | 938 |
| `dartboard` | [dartboard](https://polyhaven.com/a/dartboard) | room | 1.0 | 45 × 45 × 4 | 6,800 |

`teacup` is placed twice. Loose objects get a convex-hull physics collider generated from their mesh;
furniture gets an exact triangle-mesh collider.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/process_room_assets.py -- tools/source/polyhaven public/models/items
```

## Font

- **Inter Tight** (Rasmus Andersson), SIL Open Font License 1.1 — latin subset woff2 from Google
  Fonts, bundled at `public/fonts/inter-tight.woff2`. Used for keycap legends and on-screen copy.

## Attribution text (for credits)

> "Keyboard 75%" by kennypang, "Computer Mouse" by PoneMyintMyat and "Monitor" by ElectroDbstp — all CC BY 4.0 via Sketchfab,
> modified (split, renamed, subdivided, rescaled, re-materialled as jelly).

## Reproducing the pipeline

```bash
# the unmodified source GLBs (from the Objaverse mirror on Hugging Face) are kept in tools/source/
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/process_assets.py -- tools/source public/models
```
