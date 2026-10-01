/**
 * GLSL for the jelly deformation. Everything here is an *analytic approximation*, not a soft-body
 * simulation: each vertex is displaced by a smooth function of the interaction state, and the
 * normal is rebuilt from finite differences of that same function so shading follows the shape.
 */

/** Builds an orthonormal tangent frame around n and re-derives the normal from the displaced neighbours. */
export const normalFromDisplacement = /* glsl */ `
  void jellyFrame(in vec3 n, out vec3 t1, out vec3 t2) {
    vec3 a = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    t1 = normalize(cross(a, n));
    t2 = cross(n, t1);
  }
`

/* ------------------------------------------------------------------ keyboard body (case + caps ride it) */
/**
 * The whole board is one piece of gelatin. The CPU writes a coarse field over the keyboard footprint
 * (uBodyField, in millimetres): R = local sag under pressed keys, G/B = sideways push of displaced
 * material. On top of that sit whole-board spring modes: bounce, sway and rock. The case and every cap
 * evaluate the same function at their own position, so they move together and never separate.
 */
const keyboardBodyPars = /* glsl */ `
  uniform sampler2D uBodyField;
  uniform vec4 uFieldRect;  // minX, minZ, sizeX, sizeZ (object space, m)
  uniform vec4 uBody;       // bounce (m), swayX (m), swayZ (m), unused
  uniform vec2 uRock;       // slope dy/dx, dy/dz at the top of the board
  uniform float uBodyTop;   // height of the tallest cap (m)
  uniform float uPlateY;    // height of the case top (m)

  vec3 keyboardBody(vec3 p) {
    vec2 uv = (p.xz - uFieldRect.xy) / uFieldRect.zw;
    vec4 f = texture(uBodyField, uv) * 0.001;
    float hb = clamp(p.y / uBodyTop, 0.0, 1.0);
    float plate = smoothstep(0.0, uPlateY, p.y);          // the underside stays on the desk
    float wall = sin(3.14159 * clamp(p.y / uPlateY, 0.0, 1.0));
    vec3 d = vec3(0.0);
    d.y -= f.r * plate;
    d.xz += f.gb * wall;                                   // case walls belly out beside a sag
    d.y += uBody.x * hb;
    d.xz += uBody.yz * hb;
    d.y += (uRock.x * p.x + uRock.y * p.z) * hb;
    return d;
  }
`

export const caseVertexPars = /* glsl */ `
  varying float vJellyThick;
  ${keyboardBodyPars}
  ${normalFromDisplacement}

  void caseDeform(in vec3 p, in vec3 n, out vec3 outP, out vec3 outN) {
    outP = p + keyboardBody(p);
    vJellyThick = 1.0;
    vec3 t1, t2; jellyFrame(n, t1, t2);
    float e = 0.001;
    vec3 p1 = (p + t1 * e) + keyboardBody(p + t1 * e);
    vec3 p2 = (p + t2 * e) + keyboardBody(p + t2 * e);
    vec3 nn = cross(p1 - outP, p2 - outP);
    outN = dot(nn, nn) > 1e-18 ? normalize(nn) : n;
  }
`

/* ------------------------------------------------------------------ keycaps */
export const keycapVertexPars = /* glsl */ `
  ${keyboardBodyPars}
  attribute float aKey;
  attribute vec3 aCenter;   // cap centre at its bottom face (object space)
  attribute vec3 aSize;     // cap width / height / depth
  uniform sampler2D uKeyState; // row0: press, touchX, touchZ, touchAmt   row1: wobX, wobZ, wobY, seed
  uniform float uTravel;    // rigid switch travel (m)
  uniform float uSquash;    // fraction of cap height lost at full press
  uniform float uDimple;    // fingertip dimple depth (m)
  varying float vJellyThick; // relative optical thickness for transmission (thick centre, thin chamfers)
  ${normalFromDisplacement}

  vec3 keycapDisplace(vec3 p, vec4 s0, vec4 s1) {
    vec3 l = p - aCenter;                       // local, bottom-centred
    float h = max(aSize.y, 1e-4);
    float hn = clamp(l.y / h, 0.0, 1.0);        // 0 bottom .. 1 top
    float press = s0.x;
    float pressC = clamp(press, 0.0, 1.0);

    // 1. vertical squash: the top loses height, the bottom stays attached to the stem
    float squash = pressC * uSquash;
    float bulge = squash * 0.55 * sin(3.14159 * hn);          // sides belly outward mid-height (volume-ish)
    vec3 d = vec3(0.0);
    d.y -= squash * l.y;
    d.xz += l.xz * bulge;

    // 2. fingertip dimple around the real touch point, only the upper part of the cap caves in
    vec2 t = s0.yz * aSize.xz;                                  // touch in metres from centre
    vec2 r = l.xz - t;
    float sigma = 0.30 * min(aSize.x, aSize.z);
    float g = exp(-dot(r, r) / (2.0 * sigma * sigma));
    float dimple = uDimple * s0.w * pressC;
    float topW = hn * hn;
    d.y -= dimple * g * topW;
    // material pushed away from the finger bulges the nearby sides outward
    d.xz += (r / sigma) * dimple * 0.45 * g * sin(3.14159 * hn);   // ∝ gradient of the Gaussian: no singularity at the touch point

    // 3. secondary motion: lateral shear + vertical bounce, strongest at the top
    d.xz += s1.xy * hn;
    d.y += s1.z * hn;

    // 4. travel of the whole cap on the switch (never below the case: press clamped)
    d.y -= pressC * uTravel + min(press, 0.0) * uTravel * 0.6;

    // 5. the cap rides the board it is sitting in
    d += keyboardBody(p);
    return p + d;
  }

  void keycapDeform(in vec3 p, in vec3 n, out vec3 outP, out vec3 outN) {
    ivec2 k = ivec2(int(aKey + 0.5), 0);
    vec4 s0 = texelFetch(uKeyState, k, 0);
    vec4 s1 = texelFetch(uKeyState, k + ivec2(0, 1), 0);
    outP = keycapDisplace(p, s0, s1);
    vec3 l = p - aCenter;
    float edge = smoothstep(0.30, 0.5, max(abs(l.x) / aSize.x, abs(l.z) / aSize.z));
    float hn = clamp(l.y / max(aSize.y, 1e-4), 0.0, 1.0);
    vJellyThick = (0.35 + 0.65 * (1.0 - edge)) * (0.55 + 0.45 * hn) * (1.0 - 0.35 * clamp(s0.x, 0.0, 1.0));
    vec3 t1, t2; jellyFrame(n, t1, t2);
    float e = 0.0006;
    vec3 p1 = keycapDisplace(p + t1 * e, s0, s1);
    vec3 p2 = keycapDisplace(p + t2 * e, s0, s1);
    vec3 nn = cross(p1 - outP, p2 - outP);
    outN = dot(nn, nn) > 1e-18 ? normalize(nn) : n;
  }
`

/* ------------------------------------------------------------------ mouse (shell, body, band, housing) */
/**
 * One displacement function for every part of the mouse, written only in terms of position (plus the
 * normal for the fingertip dent), so neighbouring parts move together and the seams stay closed.
 */
export const mouseVertexPars = /* glsl */ `
  uniform vec4 uLeft;      // dent, touch.xyz (object space)
  uniform vec4 uRight;
  uniform vec4 uClick;     // leftClick, rightClick (button travel), squeeze, unused
  uniform vec3 uWobble;    // lateral shear x/z, vertical bounce y
  uniform vec3 uBounds;    // shell half width, shell base height, top height
  uniform float uDent;     // dent depth (m)
  varying float vJellyThick;
  ${normalFromDisplacement}

  vec3 mouseDisplace(vec3 p, vec3 n) {
    float hAll = clamp(p.y / uBounds.z, 0.0, 1.0);                         // 0 on the desk .. 1 at the crown
    float hn = clamp((p.y - uBounds.y) / max(uBounds.z - uBounds.y, 1e-4), 0.0, 1.0);
    float upper = smoothstep(0.25, 0.7, hn);
    vec3 d = vec3(0.0);

    // fingertip dents follow the surface normal so they read as pressing into skin
    for (int i = 0; i < 2; i++) {
      vec4 s = i == 0 ? uLeft : uRight;
      vec3 r = p - s.yzw;
      float sigma = 0.0125;
      float g = exp(-dot(r, r) / (2.0 * sigma * sigma));
      d -= n * (uDent * s.x * g * upper);
      float ring = exp(-pow((length(r) - 0.019) / 0.007, 2.0));          // displaced volume lifts a soft ring
      d += n * (uDent * 0.18 * s.x * ring * upper);
    }

    // button travel: the front half sinks on that side; fades to nothing at the desk
    float front = smoothstep(0.0, -0.02, p.z);
    float sideL = smoothstep(0.002, -0.006, p.x);
    float sideR = smoothstep(-0.002, 0.006, p.x);
    float lift = smoothstep(0.003, 0.02, p.y);
    d.y -= front * (uClick.x * sideL + uClick.y * sideR) * 0.0014 * lift;
    // every click also squashes the whole body a little
    d.y -= (uClick.x + uClick.y) * 0.0006 * hAll;

    // squeeze: flanks move inward (position based, so shell/band/body agree), the crown rises
    d.x -= (p.x / uBounds.x) * uClick.z * 0.0016 * smoothstep(0.0, 0.02, p.y) * (1.0 - front * 0.5);
    d.y += uClick.z * 0.0009 * smoothstep(0.022, 0.037, p.y);

    // secondary motion measured from the desk up, the same for every part
    d.xz += uWobble.xz * hAll;
    d.y += uWobble.y * hAll;
    return p + d;
  }

  void mouseDeform(in vec3 p, in vec3 n, out vec3 outP, out vec3 outN) {
    outP = mouseDisplace(p, n);
    float hAll = clamp(p.y / uBounds.z, 0.0, 1.0);
    float dents = uLeft.x * exp(-dot(p - uLeft.yzw, p - uLeft.yzw) / (2.0 * 0.0125 * 0.0125))
                + uRight.x * exp(-dot(p - uRight.yzw, p - uRight.yzw) / (2.0 * 0.0125 * 0.0125));
    vJellyThick = (0.45 + 0.55 * smoothstep(0.1, 0.9, hAll)) * (1.0 - 0.3 * clamp(dents, 0.0, 1.0));
    vec3 t1, t2; jellyFrame(n, t1, t2);
    float e = 0.0008;
    vec3 p1 = mouseDisplace(p + t1 * e, n);
    vec3 p2 = mouseDisplace(p + t2 * e, n);
    vec3 nn = cross(p1 - outP, p2 - outP);
    outN = dot(nn, nn) > 1e-18 ? normalize(nn) : n;
  }
`

/* ------------------------------------------------------------------ loose items */
/**
 * Pick-up-able objects are rigid bodies in the physics engine; this makes them *look* soft. The CPU watches
 * each body's velocity: a sudden change (an impact) sets the squash axis and kicks a squash spring, and
 * accelerations kick a lag spring. Geometry is centred on the body origin.
 *  - squash: compress along the impact axis, anchored at the contact face so the object never sinks into
 *    what it hit, with a sideways bulge (volume-ish preservation)
 *  - lag: the extremities trail behind the centre, so thrown and shaken objects wobble
 */
export const itemVertexPars = /* glsl */ `
  uniform vec4 uSquash;   // xyz: local unit axis pointing from the contact toward the centre, w: amount
  uniform vec3 uLag;      // local-space offset (m) reached at the object's extremities
  uniform vec3 uHalf;     // local half extents (m)
  varying float vJellyThick;
  ${normalFromDisplacement}

  vec3 itemDisplace(vec3 p) {
    vec3 ax = uSquash.xyz;
    float s = uSquash.w;
    float R = dot(abs(ax), uHalf);
    float along = dot(p, ax);
    vec3 perp = p - ax * along;
    vec3 q = ax * (along - s * (along + R)) + perp * (1.0 + 0.45 * s);
    q += uLag * (dot(p, p) / max(dot(uHalf, uHalf), 1e-6));
    return q;
  }

  void itemDeform(in vec3 p, in vec3 n, out vec3 outP, out vec3 outN) {
    outP = itemDisplace(p);
    vJellyThick = 1.0;
    vec3 t1, t2; jellyFrame(n, t1, t2);
    float e = 0.0008;
    vec3 p1 = itemDisplace(p + t1 * e);
    vec3 p2 = itemDisplace(p + t2 * e);
    vec3 nn = cross(p1 - outP, p2 - outP);
    outN = dot(nn, nn) > 1e-18 ? normalize(nn) : n;
  }
`
