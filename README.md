# JELLY KEYS / JELLY MOUSE

*Familiar desktop hardware, suddenly made of jelly.*

A full-screen, real-time 3D scene: a whole desk in a small room, where everything is the same
translucent cranberry gelatin. A computer (monitor with a glowing screen, keyboard, mouse) you can type on and click, thirty-odd desk objects
you can pick up, throw and bounce (a duck, an apple, a teapot, chess pieces, a gnome...), on a found
office desk, with a chair, bookshelf, plant, lamps, clock and pictures around it. Every object is a
found model; nothing was modelled for this.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production build
```

Node 20+ recommended. WebGL2 is required.

## Interact

| Where | Input | Response |
|---|---|---|
| Empty space (walls, floor, desk top) | drag | orbit the camera around the room |
| Anywhere except the jelly mouse | scroll / pinch | zoom in and out |
| Empty space | right-drag / shift-drag / two-finger drag | pan |
| RESET button (top right) | click | every object goes back to its spot, keys and mouse are released, the camera returns to the starting view |
| Any loose object | press and drag | it lifts off the desk and follows the pointer, still colliding with everything; it wobbles as you move it |
| Any loose object | release while moving | it is thrown, bounces, squashes on impact and settles; anything that lands on the floor drops back onto the desk after a moment |
| Keyboard | press / drag across caps, or type on your physical keyboard | cap travels, top caves under the fingertip, sides bulge, neighbours wobble, the whole board sags and rocks; the letters appear on the monitor |
| Mouse | left / right click and hold | that side dents around the click point; holding squeezes the whole body |
| Mouse | scroll wheel over the mouse | the jelly wheel spins with inertia and detents and compresses |

Pressing on an object always acts on the object (grab, type, click); only presses on empty space move
the camera, and a scroll over the jelly mouse spins its wheel instead of zooming. Until you move the
camera yourself, it shows the whole desk, moves in when you use the keyboard or mouse, and drifts back
after about 9 s. Once you have orbited, zoomed or panned, it stays exactly where you put it until
Reset. The camera is kept inside the room (and a little out of its open front).

## What is simulated vs. approximated

Be precise about this: **there is no soft-body solver**.

- **Rigid-body physics (Rapier, 120 Hz)** — the loose objects are rigid bodies with convex-hull
  colliders; the desk, chair, shelf, plant and lamp are exact triangle-mesh colliders; the room shell,
  keyboard and mouse are boxes. Gravity, collisions, friction, bouncing, stacking and throwing are
  real physics. A held object is steered by setting its velocity toward the pointer before every
  physics step, so it keeps colliding and behaves the same at any frame rate.
- **Soft look of the loose objects (approximation)** — the bodies are rigid; the softness is visual.
  Each frame the object's velocity change is measured. A sudden change is an impact: it sets a squash
  axis and kicks a squash spring; accelerations kick a lag spring. The vertex shader squashes along
  the impact axis, anchored at the contact face so the object never sinks into what it hit, bulges
  sideways, and lets the extremities trail the centre. Collisions use the undeformed shape.
- **Simulated (CPU, spring–damper ODEs, 240 Hz sub-steps)** — per key: press travel (critically
  damped down, under-damped back), fingertip position/amount, a 3-DOF wobble (lateral shear +
  vertical bounce) excited by impulses. Neighbouring caps receive distance-weighted impulses so the
  material feels shared. Stiffness is jittered per key and impulse directions are randomised, so
  repeated presses never replay the same motion. Mouse: click travel, soft skin dent,
  squeeze build-up, wheel inertia + 24 detents + compression, body wobble.
  Keyboard body: each frame the key presses are splatted into a coarse sag/push field over the
  board (64×28, half-float texture), and five whole-board springs (bounce, sway x/z, rock x/z) are
  kicked at the position of every press and release.
- **Approximated (GPU vertex shader)** — the *shape*. Each vertex is displaced by an analytic
  function of that state: whole-cap squash with mid-height bulge (volume-ish preservation), a
  Gaussian fingertip dimple around the real touch point (transformed into object space) with a
  small outward ring, shear/bounce scaled by height, and rigid travel. Mouse dents push along the
  surface normal with a displaced-volume ring. Normals are rebuilt from finite differences of the
  same displacement so highlights and reflections move with the deformed surface. Displacement is
  clamped so caps never pass through the case or invert.
- **Keyboard and mouse bodies** — the case and every cap evaluate the same board field at their
  own position, so the case sags under pressed keys and caps ride the board as it bounces and rocks.
  All mouse parts share one position-based displacement, so dents, squeeze and wobble stay continuous
  across the part seams. The keyboard and mouse themselves stay where they are on the desk.
- **Furniture, walls and floor do not deform.** They are the same material, but static.
- **Shadows follow the deformation** — the same displacement is injected into the depth
  materials used for shadow maps.
- **Jelly material** — `MeshPhysicalMaterial` tuned as clear gelatin: full transmission, low
  roughness, a sharp clearcoat for the moist skin, and colour that comes from volume attenuation
  rather than the surface. The optical thickness is set per pixel: the shape's own variation (thick
  cap centres, thin chamfers, thinner where dented) times how directly the surface faces the viewer,
  so thin edges stay lighter and thick middles deepen. The surface tint itself is a vibrant red, so
  even the thinnest parts (keycap walls, pens) stay saturated. Keycap legends
  are opaque ivory ink inside the clear caps (a transmission map).
- **Translucency glow (approximation)** — light scattered inside gelatin is faked in the fragment
  shader: a warm red glow that is strongest at thin rims and thin parts, plus back-light from the
  studio's rim light passing through toward the camera. Thick middles stay deep crimson, so each
  object has bright edges and a dark core and separates from its neighbours. Furniture uses the same
  glow; the desk top gets less, so it stays a slightly deeper stage for the objects. Overall
  brightness is set with the renderer exposure (1.15). This is not true
  subsurface scattering.
- **Room** — furniture and decor are clear red jelly. The shell (floor and three walls) is an
  opaque version of the same red jelly, with a wet clearcoat and a faint deep-red self-glow standing
  in for light scattered inside thick gelatin: three.js cannot show one translucent object through
  another, so the clear jelly needs something solid behind it to refract. The desk top has no
  clearcoat and dimmed reflections, because a large glossy surface reflected the key light white.
- **Monitor screen** — shows a minimal text editor that fills with whatever you type, on your real
  keyboard or by pressing the jelly keys (Backspace deletes, Enter starts a new line, Reset clears it).
  It is a canvas texture drawn in the page and mapped by the shader onto the panel's front faces inside
  the bezel line; no geometry was added. The screen does not cast light.
  The monitor is static and collides as an exact mesh.
- **Desk shadows (approximation)** — soft contact shadows: a camera under the desk top looks up at
  the objects (not the desk), nearer means darker, and the result is blurred and tinted cranberry.
  They follow objects as they move and fade as objects are lifted. They are drawn from undeformed
  shapes. The floor and walls also receive ordinary shadow-map shadows. There are no caustics.
- **Lighting** — an HDR studio built from area-light formers (large soft key, controlled fill, rim
  strip, dark negative-fill card) for coherent reflections, one shadow-casting key light, blurred
  contact shadows re-rendered every frame, and screen-space AO (N8AO) for contact depth.
- **Post** — Khronos PBR Neutral tone mapping (keeps saturated reds saturated; AgX washed them toward white), screen-space ambient occlusion, mild vignette, SMAA. No bloom, no
  depth of field.
- **Adaptive resolution** — render resolution starts at up to 1.5x and steps down (to 0.85x) or up
  (to the display's own density, capped at 2x) according to the measured frame rate.

## Assets

See [ASSETS.md](ASSETS.md). The keyboard, mouse and monitor are CC BY models from Sketchfab (via Objaverse);
the desk, furniture, decor and all loose objects are 41 CC0 models from Poly Haven. Each was inspected
and cleaned in headless Blender (`tools/process_assets.py`, `tools/process_room_assets.py`), and the
unmodified sources are kept in `tools/source/`. Legends are authored at runtime in Inter Tight (OFL).
The room shell (floor, walls) is the only generated geometry.

## Structure

```
src/
  App.tsx                 canvas + the only copy on screen
  store.ts                focus state (hero / keyboard / mouse)
  scene/Scene.tsx         camera rig, studio lighting, physics world, post-processing
  scene/Room.tsx          found desk, furniture and wall decor, room shell, colliders
  scene/Items.tsx         loose objects: physics bodies, drag/throw, squash springs
  scene/DeskShadows.tsx   soft contact shadows on the desk top
  scene/Keyboard.tsx      merges 84 caps into one draw call, legend UVs, pointer + key events
  scene/Mouse.tsx         shell / body / wheel, click + scroll events
  jelly/shaders.ts        GLSL displacement + finite-difference normals
  jelly/jellyMaterial.ts  material patching (lit + depth) and the palette
  jelly/keyboardSim.ts    per-key springs, neighbour coupling → DataTexture
  jelly/mouseSim.ts       button / squeeze / wheel / wobble springs
  jelly/legends.ts        canvas legend atlas
  jelly/layout.ts         key codes → legends
tools/process_assets.py   Blender cleanup pipeline for the keyboard and mouse
tools/process_room_assets.py  Blender pipeline for the Poly Haven room and desk objects
tools/source/             unmodified CC-BY source GLBs
```

## Known limitations

- **Not watched live.** Everything was verified as still frames from a software renderer at roughly
  one frame per second (1440×900 and 390×844), including a scripted pointer grab, lift and throw.
  The feel of the motion in real time, and the frame rate on real hardware, are unverified. A room
  full of translucent material is demanding; the adaptive resolution is there for that reason.
- Touch input on a phone has not been tested on a device.
- Loose objects collide as rigid convex hulls: cups and the pencil cup are solid (nothing can be
  dropped inside them), and the visual squash does not change the collision shape.
- Translucent objects do not show each other through themselves (three.js renders them in one pass
  against the opaque scene only); through a jelly object you see the walls and floor.
- The keyboard and mouse cannot be picked up. Furniture, walls and floor do not deform.
- Keycaps are single-sided on purpose: double-sided translucent meshes are drawn into the
  transmission buffer and showed up as smears through other objects.
- `window.__jelly` and the `?noshadow` / `?nopost` / `?physics` flags exist in dev builds only.
