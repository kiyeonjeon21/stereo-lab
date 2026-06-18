# stereo-lab — Code Walkthrough

The UI is just the surface. The point of this lab is the **code** — each station is a
small, self-contained reading of one 3D concept. This doc walks the code top to bottom,
quotes the lines that matter, and explains *why* they're written that way.

Read it in order: the shared skeleton first, then stations 00 → 05. Each station follows
the pipeline of building 3D things:

> **procedural geometry → file I/O → rendering → shaders → motion → physics**

Every station also has a **graduation question** — when you can answer it from the code,
you've got the concept.

---

## Table of contents

- [The shared skeleton](#the-shared-skeleton) — router + viewer that every station builds on
- [Station 00 — the render loop](#station-00--the-render-loop)
- [Station 01 — procedural geometry (Manifold)](#station-01--procedural-geometry-manifold)
- [Station 02 — glTF I/O round-trip](#station-02--gltf-io-round-trip)
- [Station 03 — SDF raymarching](#station-03--sdf-raymarching)
- [Station 04 — motion (Theatre.js)](#station-04--motion-theatrejs)
- [Station 05 — physics (Rapier)](#station-05--physics-rapier)
- [Station 06 — PBR + image-based lighting](#station-06--pbr--image-based-lighting)
- [Station 07 — character animation](#station-07--character-animation)
- [Station 08 — performance (compress + BVH)](#station-08--performance-compress--bvh)
- [Station 09 — abstraction (React Three Fiber)](#station-09--abstraction-react-three-fiber)
- [Station 10 — walkable level (FPS + collision)](#station-10--walkable-level-fps--collision)
- [Station 11 — postprocessing (bloom)](#station-11--postprocessing-bloom)
- [Station 12 — shadows](#station-12--shadows)
- [Station 13 — transmission / glass](#station-13--transmission--glass)
- [Station 14 — morph-target flock](#station-14--morph-target-flock)
- [How to study](#how-to-study)

> Stations 00–05 are the **pipeline fundamentals** (geometry → I/O → render → shader →
> motion → physics) on toy data. Stations 06–09 are the **advanced layer**: real
> textured/animated models and deeper tooling. Stations 10–14 are the **fun layer**: a
> walkable map and rendering effects (bloom, shadows, glass, flocking).

---

## The shared skeleton

Two files make the whole app work; understand these and every station reads easily.

### The router — `src/main.ts`

Each station is just a module that exports one function. The contract (`src/main.ts:4`):

```ts
type MountFn = (container: HTMLElement) => void | (() => void);
```

`mount(container)` builds the scene into `container` and **optionally returns a cleanup
function**. That return value is the key idea: it lets each station tear itself down when
you navigate away.

Stations are registered as lazy imports (`src/main.ts:6`):

```ts
const STATIONS = [
  { id: '00-render-loop', label: '00 · render loop', load: () => import('./stations/00-render-loop') },
  { id: '01-manifold',    label: '01 · manifold',    load: () => import('./stations/01-manifold') },
  // …
];
```

`() => import(...)` is a **dynamic import** — Vite splits each station into its own JS
chunk that only downloads when you visit it. That's why the heavy stations (Theatre's
editor, Rapier's WASM) don't slow down the others.

Navigating is just the URL hash. `route()` runs on every `hashchange` (`src/main.ts:34`):

```ts
async function route() {
  const id = currentId();
  const myToken = ++token;

  if (cleanup) {
    try { cleanup(); } catch (err) { console.error('cleanup failed', err); }
    cleanup = null;
  }
  app.replaceChildren();
  // …
  const mod = await station.load();
  if (myToken !== token) return; // a newer route() superseded us
  const result = mod.mount(app);
  cleanup = typeof result === 'function' ? result : null;
}
```

Three things worth noticing:

1. **Cleanup before mount.** The previous station's cleanup runs first, then the
   container is emptied, then the new station mounts. Without this, every station switch
   would leak a WebGL context and a running animation loop.
2. **The `token` guard.** `load()` is async. If you click fast, an older import could
   resolve *after* a newer one already mounted. `myToken !== token` detects that the
   route is stale and bails, so a slow import can't clobber the current screen.
3. **`cleanup` is whatever `mount` returned** — the contract from above, closing the loop.

### The 3D bootstrap — `src/lib/viewer.ts`

Every 3D station would otherwise repeat the same ~30 lines of three.js setup. `createViewer()`
does it once and hands back a tiny interface (`src/lib/viewer.ts:4`):

```ts
export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  onFrame: (cb: (elapsed: number, delta: number) => void) => void;
  dispose: () => void;
}
```

The render loop is the heart (`src/lib/viewer.ts:46`):

```ts
function loop() {
  if (disposed) return;
  raf = requestAnimationFrame(loop);
  const delta = clock.getDelta();          // seconds since last frame
  const elapsed = clock.getElapsedTime();  // seconds since start
  for (const cb of callbacks) cb(elapsed, delta);  // run station logic
  controls.update();
  renderer.render(scene, camera);
}
```

This is the loop the whole lab revolves around: ~60×/second the browser calls `loop`, which
asks for the next frame (`requestAnimationFrame`), runs every registered `onFrame` callback,
then draws. Stations never write their own loop — they just call `onFrame(...)` to hook in.

`dispose()` is the mirror image — it stops the loop and frees the GPU (`src/lib/viewer.ts:72`):

```ts
dispose: () => {
  disposed = true;
  cancelAnimationFrame(raf);
  resize.disconnect();
  controls.dispose();
  renderer.dispose();
  renderer.domElement.remove();
}
```

Every station's cleanup ends by calling this. Keep this `loop`/`dispose` pair in mind —
the shader and physics stations build the exact same pattern by hand.

---

## Station 00 — the render loop

**Concept:** how does animation actually happen? **Graduation question:** what makes the
cube spin — and what would make it spin at the same speed on a 30Hz and a 144Hz screen?

The entire station (`src/stations/00-render-loop.ts:16`):

```ts
viewer.onFrame((elapsed) => {
  cube.rotation.x = elapsed * 0.6;
  cube.rotation.y = elapsed * 0.9;
});
```

**Reading it:** rotation is set from `elapsed` (seconds since start), *not* incremented by a
fixed amount per frame. That's the lesson: drive animation from **time**, not from frame
count. `rotation = elapsed * 0.6` reaches the same angle at the same wall-clock moment no
matter the frame rate. (If you instead wrote `rotation += 0.01` each frame, a 144Hz monitor
would spin it ~2.4× faster than a 60Hz one.)

**Try it:** change `0.6`/`0.9`, or switch to `delta` (the second callback arg) and `+=` to
feel the difference a frame-rate-dependent version makes.

---

## Station 01 — procedural geometry (Manifold)

**Concept:** "code = model." A CAD kernel turns operations into a solid and hands back raw
vertex/index arrays; the renderer just consumes them. **Graduation question:** what exactly
does `boolean subtract` produce, and what data type does the renderer actually receive?

Three files cooperate: `lib/manifold.ts` (kernel access), `lib/building.ts` (the model),
`stations/01-manifold.ts` (wire to screen).

### Booting the WASM kernel — `src/lib/manifold.ts:12`

```ts
export async function getManifold(): Promise<ManifoldToplevel> {
  if (!instance) {
    instance = await Module({ locateFile: () => wasmUrl });
    instance.setup();
  }
  return instance;
}
```

Manifold is compiled from C++ to WebAssembly. `Module({ locateFile })` loads that `.wasm`
binary; `wasmUrl` comes from `import wasmUrl from 'manifold-3d/manifold.wasm?url'`
(`src/lib/manifold.ts:5`) — Vite's `?url` hands back the served path so Emscripten can fetch
it. It's cached in `instance` so the kernel boots once.

### The model — `src/lib/building.ts:14`

This is the "code = model" core — three operations, one little building:

```ts
export function buildBuilding(wasm: ManifoldToplevel) {
  const { Manifold, CrossSection } = wasm;

  // 1. primitive
  const body = Manifold.cube([4, 3, 4], true);

  // 2. boolean difference — carve a shaft through the body
  const shaft = Manifold.cube([1.4, 4, 1.4], true);
  let solid = body.subtract(shaft);

  // 3. extrude a 2D square into a tapered roof, then union it on
  const roofProfile = CrossSection.square([4, 4], true);
  const roof = Manifold.extrude(roofProfile, 1.6, 0, 0, [0.15, 0.15]);
  const roofPlaced = roof.rotate([-90, 0, 0]).translate([0, 1.5, 0]);
  solid = solid.add(roofPlaced);

  return solid;
}
```

**Reading it:**
- `Manifold.cube(...)` is a **primitive** — a watertight box.
- `.subtract(shaft)` is a **boolean difference**: the kernel recomputes the surface so the
  shaft becomes a hollow void through the body. (`.add` = union, `.intersect` = intersection.)
- `CrossSection.square(...).extrude(...)` lofts a 2D shape into 3D. The `scaleTop` arg
  `[0.15, 0.15]` shrinks the top → a tapered roof. `extrude` grows along +Z, so
  `.rotate([-90,0,0])` stands it upright and `.translate` sits it on the body.

Notice this function takes `wasm` as a parameter and is **pure** — that's deliberate. The
browser station and the Node `.glb` generator both call it, guaranteeing identical geometry.

### Kernel output → renderer — `src/lib/manifold.ts:25`

```ts
const mesh = manifold.getMesh();
const geometry = new THREE.BufferGeometry();
if (mesh.numProp === 3) {
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
}
// …
geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
geometry.computeVertexNormals();
```

**This is the "click."** `getMesh()` returns two flat typed arrays: `vertProperties`
(float positions) and `triVerts` (integer triangle indices). A three.js `BufferGeometry` is
*also* just position + index buffers. So converting the kernel's output to something
renderable is a direct copy — the renderer never knows it came from a boolean operation.
`numProp` is how many floats describe each vertex (3 = just xyz); the `else` branch handles
the rare case where extra per-vertex data is interleaved.

### Wiring it up — `src/stations/01-manifold.ts:16`

```ts
getManifold().then((wasm) => {
  const solid = buildBuilding(wasm);
  const geometry = manifoldToGeometry(solid);
  solid.delete(); // free the WASM-side solid once we've copied its mesh out
  // … make a mesh, add to scene, spin it
});
```

`solid.delete()` matters: the solid lives in WASM memory, which the JS garbage collector
can't reclaim. Once we've copied the mesh into a `BufferGeometry`, we free it by hand.

**Try it:** in `buildBuilding`, change the shaft size, or swap `extrude`'s `scaleTop` to
`[0, 0]` for a pointed cone roof. Reload — the browser regenerates instantly.

---

## Station 02 — glTF I/O round-trip

**Concept:** the I/O layer. The *same* building is baked to a `.glb` file offline, then
loaded back and rendered. **Graduation question:** what's inside a `.glb` — how do
`scene → node → mesh → accessor → buffer` relate?

### Baking the file (Node) — `scripts/build-glb.ts`

This script runs in Node (via `npm run gen:glb`), not the browser. It reuses the exact same
model function, then assembles a glTF document by hand (`scripts/build-glb.ts:43`):

```ts
const doc = new Document();
const buffer = doc.createBuffer();
const position = doc.createAccessor('POSITION').setType('VEC3').setArray(positionArray).setBuffer(buffer);
const indices  = doc.createAccessor().setType('SCALAR').setArray(indexArray).setBuffer(buffer);
const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
const gltfMesh = doc.createMesh('building').addPrimitive(prim);
const node = doc.createNode('building').setMesh(gltfMesh);
doc.createScene('scene').addChild(node);
await new NodeIO().write(OUT, doc);
```

**Reading it — this *is* the glTF structure**, bottom to top:
- **buffer** — the raw bytes.
- **accessor** — a typed view into the buffer ("read these bytes as `VEC3` floats" =
  positions; "as `SCALAR` ints" = triangle indices).
- **primitive** — binds accessors to roles (`POSITION`, indices).
- **mesh** — one or more primitives.
- **node** — places a mesh in space (transform).
- **scene** — the root, holding nodes.

That hierarchy is the whole format. `NodeIO().write` serializes it to a binary `.glb`.

One subtlety (`scripts/build-glb.ts:40`): Manifold's arrays are typed `ArrayBufferLike`,
which gltf-transform's `setArray` rejects, so we copy them into fresh `Float32Array` /
`Uint32Array`. A small real-world friction point worth seeing.

### Loading it back (browser) — `src/stations/02-gltf.ts:15`

```ts
loader.load('models/building.glb', (gltf) => {
  // … reassign a material so it's visibly the "loaded" copy
  viewer.scene.add(gltf.scene);
  console.log('[02-gltf] glTF JSON tree:', gltf.parser.json);
});
```

`GLTFLoader` parses the `.glb` back into a three.js scene graph. The `console.log` prints
`gltf.parser.json` — the parsed glTF document, where you can see the same
`scenes / nodes / meshes / accessors` arrays the script wrote. **Open the console on this
station** and compare it to the script above: that's the round-trip closing.

The takeaway: station 01 and station 02 show the *same building* two ways — generated live
in the browser vs. baked to a file and loaded. That's the geometry → I/O seam of the pipeline.

---

## Station 03 — SDF raymarching

**Concept:** a fragment shader runs **once per pixel, independently**. There's no geometry
at all — the scene is a math function. **Graduation question:** why is it safe for the ray
to step forward by "the distance to the nearest surface" each iteration?

### The fullscreen trick — `src/lib/fullscreenShader.ts`

To run a pixel program over the whole screen, we draw one quad that covers it. The vertex
shader is a one-liner (`src/lib/fullscreenShader.ts:12`):

```glsl
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
```

It writes **clip-space** coordinates directly (the screen spans −1…1), so the quad always
fills the viewport regardless of any camera. Then the fragment shader does all the work. The
helper feeds it Shadertoy-style uniforms (`src/lib/fullscreenShader.ts:35`):

```ts
const uniforms = {
  iResolution: { value: new THREE.Vector2(...) },
  iTime:       { value: 0 },
  iMouse:      { value: new THREE.Vector4(0, 0, 0, 0) },
};
```

`iTime` is bumped every frame and `iMouse` tracks the pointer — the only inputs the shader
needs. (This helper is the shader-world sibling of `viewer.ts`: same loop + dispose pattern,
but for a 2D image shader.)

### The scene as a function — `src/stations/03-sdf.frag.glsl`

A **signed distance function (SDF)** returns the distance from a point to a surface
(`03-sdf.frag.glsl:16`):

```glsl
float sdSphere(vec3 p, float r) { return length(p) - r; }
```

The whole scene is one `map()` that returns the distance to the *nearest* thing
(`03-sdf.frag.glsl:60`):

```glsl
float map(vec3 p) {
  vec3 c = p - vec3(0.0, 1.0 + 0.1 * sin(iTime), 0.0);   // bob
  float sphere = sdSphere(c - vec3(-0.6, 0.0, 0.0), 0.9);
  float box    = sdBox(c - vec3(0.6, 0.0, 0.0), vec3(0.7));
  float k = 0.5 + 0.45 * sin(iTime * 0.6);               // time-driven blend
  float blob = opSmoothUnion(sphere, box, k);
  float ground = sdPlane(p, 0.0);
  return min(blob, ground);
}
```

`opSmoothUnion` (a *smooth minimum*) melts the sphere and box together instead of
intersecting them hard; `k` is the blend radius, animated by `iTime` so they flow in and
out of each other. `min(blob, ground)` unions the blob with the floor.

The rendering happens in `raymarch` (`03-sdf.frag.glsl:86`):

```glsl
float raymarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.001 || t > 40.0) break;  // hit, or escaped
    t += d;                            // step by the distance to the nearest surface
  }
  return t;
}
```

**This is the graduation answer.** From point `p`, `map(p)` is the distance to the closest
surface — meaning a sphere of that radius around `p` is guaranteed empty. So you can leap
the whole distance `d` forward with zero risk of skipping through anything. Near a surface
the steps shrink to nothing; far away they're huge. This is "sphere tracing," and it's why
a `for` loop *inside one pixel* renders a 3D scene — the loop the render-loop stations made
explicit is here hidden inside the screen.

The rest of `main()` builds an orbiting camera ray per pixel, gets the surface normal from
the **gradient** of the field (`calcNormal`, `03-sdf.frag.glsl:76` — sampling `map` in ±x/±y/±z),
adds soft shadows and a little floor noise, and gamma-corrects. All of it is arithmetic;
none of it is geometry.

**Try it:** change `k`'s range, swap `sdBox` for another distance function, or add a third
shape with another `min(...)` in `map()`. Vite hot-reloads the shader on save.

---

## Station 04 — motion (Theatre.js)

**Concept:** a keyframe is a stored **time → value** function. Theatre's *Studio* is the
editor; one callback bridges its values onto a mesh. **Graduation question:** what single
function connects the timeline to the cube, and how does the default code animation hand off
to Theatre?

### The animatable object — `src/stations/04-motion.ts:46`

```ts
const sheet = getProject('stereo-lab').sheet('motion');
const obj = sheet.object('Cube', {
  position: { x: types.number(0, { range: [-6, 6] }), y: types.number(1, ... ), z: ... },
  rotation: { x: ..., y: ..., z: ... },
  scale: types.number(1, { range: [0.2, 3] }),
  color: types.rgba({ r: 0.35, g: 0.65, b: 1, a: 1 }),
});
```

A **sheet** holds animatable **objects**; each prop you declare becomes a keyframe-able
track in the Studio panel. `types.number(default, {range})` and `types.rgba(...)` give
Studio the right editor widget and limits.

### The bridge — `src/stations/04-motion.ts:73`

```ts
const unsubscribe = obj.onValuesChange((v) => {
  applyToMesh(v);
  if (firstEmit) { firstEmit = false; return; } // ignore the initial sync emit
  theatreDriving = true; // a real change → Studio/sequencer is now in control
});
```

**`onValuesChange` is the entire integration.** Whenever Theatre's values change — you nudge
a prop, scrub the timeline, or press play — this fires and `applyToMesh` copies
position/rotation/scale/color onto the three.js mesh (`src/stations/04-motion.ts:61`). Theatre
knows nothing about three.js; this one callback is the glue.

### Code animation vs. a keyframed timeline — `src/stations/04-motion.ts:82`

```ts
viewer.onFrame((t) => {
  if (theatreDriving) return;
  mesh.position.set(0, 1 + Math.sin(t * 1.5) * 0.6, 0);
  mesh.rotation.set(Math.sin(t * 0.9) * 0.3, t * 0.6, 0);
});
```

With no keyframes, the cube would sit still — so by default we wiggle it with **plain code**
(a sine bob). The moment you keyframe a prop and scrub/play, `onValuesChange` fires,
`theatreDriving` latches `true`, and this demo yields — **Theatre takes over the same mesh**.
That contrast *is* the lesson: hand-written animation vs. a tool that stores motion as
editable keyframes on a timeline. (`firstEmit` skips the one initial emit Theatre sends on
subscribe, so the demo isn't killed before you've touched anything.)

### A cleanup gotcha worth reading — `src/stations/04-motion.ts:24`

```ts
function setStudioActive(active: boolean) {
  if (active) studio.ui.restore();
  else studio.ui.hide();
  const root = document.getElementById('theatrejs-studio-root');
  if (root) root.style.display = active ? '' : 'none';
}
```

Theatre's Studio is a global singleton. `studio.ui.hide()` hides the panels but leaves a
full-viewport root element mounted in `<body>` — whose invisible overlay was **intercepting
clicks on other stations** (clicking the physics canvas triggered a Theatre action instead
of dropping a box). Forcing `display:none` on the root removes it from hit-testing. A good
reminder that "hidden" UI can still eat events.

**Try it:** select **Cube** in the outline → drag `position.x` → click the ◆ to keyframe →
move the playhead, change it again, keyframe → press play. The cube now follows your timeline.

---

## Station 05 — physics (Rapier)

**Concept:** the physics step must be **decoupled** from the render step. **Graduation
question:** why step the simulation in fixed 1/60s chunks instead of once per frame?

Rapier is a Rust physics engine compiled to WASM. The `-compat` build inlines the `.wasm`,
so it just needs `await RAPIER.init()` (`src/stations/05-physics.ts:57`):

```ts
RAPIER.init().then(() => {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });  // gravity
  world.timestep = FIXED_DT;                            // 1/60 s
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), ground);
  // …
});
```

### Body vs. collider — `src/stations/05-physics.ts:36`

```ts
const body = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z),
);
world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(0.4), body);

const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
```

Two separate concepts: a **rigid body** is the thing that moves (has position, velocity,
mass — `dynamic` falls, `fixed` never moves, like the ground); a **collider** is its shape
for collision (a cuboid here, `restitution` = bounciness). The three.js `mesh` is a third,
independent thing — physics doesn't know it exists. We keep them paired in `objects[]`.

### The fixed-timestep loop — `src/stations/05-physics.ts:71`

```ts
let accumulator = 0;
viewer.onFrame((_, delta) => {
  accumulator += Math.min(delta, 0.25);        // clamp: avoid spiral of death
  while (accumulator >= FIXED_DT) {
    world.step();                              // fixed-size physics step
    accumulator -= FIXED_DT;
  }
  for (const { mesh, body } of objects) {      // render step: copy poses to meshes
    const t = body.translation();
    const r = body.rotation();
    mesh.position.set(t.x, t.y, t.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
});
```

**This is the graduation answer.** `delta` (real time since last frame) varies — 16ms at
60Hz, more on a slow frame. But a physics solver is only stable with a *constant* `dt`;
feeding it variable steps makes stacks jitter and explode. So we **accumulate** real time
and spend it in fixed `FIXED_DT` chunks: a long frame runs `world.step()` several times, a
short frame maybe zero. Physics advances in steady ticks; rendering reads wherever the
bodies currently are. The `Math.min(delta, 0.25)` clamp prevents a "spiral of death" where a
huge stall queues so many steps that the next frame stalls worse.

After stepping, the render half just copies each body's `translation()`/`rotation()` onto
its mesh — the same one-way "physics drives, render reads" flow as the Theatre bridge.

`world.free()` in cleanup (`src/stations/05-physics.ts:119`) releases the WASM simulation
memory, same discipline as `solid.delete()` in station 01.

**Try it:** change gravity, `setRestitution` (try `0.9` for bouncy), or the starting stack
in the loop. Click the canvas to drop more boxes.

---

## Station 06 — PBR + image-based lighting

**Concept:** a real model carries *textures* (base color, normal, metalness/roughness,
emissive), and shiny surfaces need an *environment* to reflect. **Graduation question:**
why does PBR *need* an environment map?

The toy `building.glb` was positions only. `DamagedHelmet.glb` is a full PBR asset. Loading
it is the same `GLTFLoader` call — the textures ride along inside the `.glb`. The new part
is lighting (`src/stations/06-pbr.ts:18`):

```ts
viewer.renderer.toneMapping = THREE.ACESFilmicToneMapping;
const pmrem = new THREE.PMREMGenerator(viewer.renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
viewer.scene.environment = envTex;
```

**Reading it:** metal and glossy surfaces show almost entirely *reflections* — with nothing
to reflect, metal renders flat black. `RoomEnvironment` is a procedural room (no HDR file
needed); `PMREMGenerator` pre-filters it into the blurred mip chain that PBR materials
sample for reflections. `scene.environment` applies it to every material at once.
`ACESFilmicToneMapping` then maps the bright HDR reflections into displayable range (the
exposure slider shows it compressing highlights). **That's the answer:** no environment →
no reflections → PBR metal looks dead.

**Try it:** drag the exposure slider; comment out the `scene.environment` line and watch the
helmet go matte/black.

---

## Station 07 — character animation

**Concept:** skeletal animation = a bone hierarchy + baked clips over time. **Graduation
question:** how does `mixer.update(delta)` mesh with the render loop? (Same time-driven idea
as station 00.)

`Soldier.glb` ships clips named `Idle / Run / Walk / TPose`. The core
(`src/stations/07-animation.ts`):

```ts
const mixer = new THREE.AnimationMixer(root);
for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
actions['Idle'].play();
viewer.onFrame((_, delta) => mixer.update(delta));   // advance by real frame time
```

**Reading it:** an `AnimationMixer` plays `AnimationClip`s on a model; each clip becomes an
`AnimationAction` you can play/stop/weight. The bridge to the screen is the last line —
`mixer.update(delta)` advances the animation by the seconds elapsed this frame, exactly the
time-driven principle from station 00 (and the mirror of station 05's fixed step). Switching
clips uses a crossfade so motion blends instead of snapping:

```ts
next.reset().setEffectiveWeight(1).play();
current.crossFadeTo(next, 0.3, false);   // blend out→in over 0.3s
```

**Try it:** click Idle / Walk / Run and watch the crossfade. Change `0.3` to `0` for an
instant (jarring) cut.

---

## Station 08 — performance (compress + BVH)

**Concept:** two performance levers — make the file *small* (gltf-transform) and make
raycasting *fast* (three-mesh-bvh). **Graduation question:** why does a BVH make raycasting a
dense mesh ~100× faster?

**Small** — `scripts/optimize-glb.ts` (run via `npm run optimize`) applies geometry-only
transforms with no extra native deps:

```ts
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN);
await doc.transform(dedup(), prune(), weld(), quantize());
await io.write(OUT, doc);
```

`quantize()` stores positions/normals/UVs at lower bit depth (≈32% smaller *geometry* here).
The script also logs that the *file total* barely moves — because this model is mostly
texture bytes. The real lesson: **profile before optimizing.** (`registerExtensions` matters:
without it `quantize`'s `KHR_mesh_quantization` is silently dropped on write.)

**Fast** — three-mesh-bvh patches three to use a Bounding Volume Hierarchy
(`src/stations/08-performance.ts:13`):

```ts
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
// …later, per mesh:
mesh.geometry.computeBoundsTree();
```

**Reading it — the answer:** a naïve raycast tests *every* triangle (O(n)). A BVH is a tree
of nested bounding boxes; the ray skips an entire branch the moment it misses that branch's
box, so it only descends toward triangles it could actually hit (≈O(log n)). The station
fires 5,000 rays at a 15k-triangle helmet in ~11ms and highlights the hovered face live; tick
"show BVH boxes" to *see* the spatial partition the ray is pruning against.

**Try it:** toggle the BVH boxes; hover to move the marker; run `npm run optimize` and read
the geometry-vs-total size breakdown.

---

## Station 09 — abstraction (React Three Fiber)

**Concept:** R3F isn't a rival to three.js — it's three.js expressed as a React component
tree, and drei is a kit of ready-made helpers. **Graduation question:** how does imperative
three.js map onto declarative JSX? (Read this beside `06-pbr.ts` — same scene, a fraction of
the wiring.)

The whole scene is a tree (`src/stations/09-r3f.tsx`):

```tsx
function Helmet() {
  const { scene } = useGLTF('models/DamagedHelmet.glb');  // replaces GLTFLoader + onload
  return <primitive object={scene} />;
}

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0.2, 3.2], fov: 50 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={['#0b0d10']} />
      <RoomEnv />
      <OrbitControls enableDamping />     {/* drei: no manual controls wiring */}
      <Suspense fallback={null}><Helmet /></Suspense>
    </Canvas>
  );
}
```

**Reading it:** every imperative step in station 06 becomes a node here — `useGLTF` replaces
`GLTFLoader` + the `onload` callback + traversal; `<OrbitControls/>` replaces constructing and
`.update()`-ing controls; `<primitive object={...}/>` mounts an existing three object into the
tree. And the router contract drops in cleanly (`src/stations/09-r3f.tsx`):

```tsx
export function mount(container: HTMLElement) {
  const root = createRoot(container);
  root.render(<Scene />);
  return () => root.unmount();   // the same mount→cleanup contract
}
```

As a framework-builder, the value here is seeing *what a good abstraction keeps vs. hides*:
drei exposes scene primitives directly but packages the boilerplate (controls, loaders,
environments) as declarative nodes.

**Try it:** diff `09-r3f.tsx` against `06-pbr.ts` and count the lines each spends on loading,
controls, and lighting. Swap `<RoomEnv/>` for drei's one-liner `<Environment preset="city" />`
(needs network) to see how much further the abstraction goes.

---

## Station 10 — walkable level (FPS + collision)

**Concept:** a real "map" you walk through in first person. **Graduation question:**
station 08 used a BVH to speed up *raycasts*; what does the Octree here speed up?
(Capsule-vs-world *collision* — same idea, partition the level's triangles so you only
test the few near the player.)

This is self-contained (first-person needs its own pointer-lock camera, so it doesn't use
`createViewer`). The collision core is three's `Octree` + `Capsule`
(`src/stations/10-fps.ts`):

```ts
worldOctree.fromGraphNode(gltf.scene);                       // level mesh → Octree
const playerCollider = new Capsule(start, end, 0.35);         // player = a capsule
// each frame, sub-stepped ×5:
const result = worldOctree.capsuleIntersect(playerCollider); // closest contact
if (result) playerCollider.translate(result.normal.multiplyScalar(result.depth)); // push out
```

**Reading it:** the player is a vertical **capsule**; the level is baked into an **Octree**
(a tree of boxes over the triangles). Each frame `capsuleIntersect` returns the contact
normal + penetration depth, and we push the capsule out along the normal, then snap the
camera to it. Movement runs **5 sub-steps per frame** (`STEPS_PER_FRAME`) so a fast move
can't tunnel through a thin wall in one big jump — the same fixed-substep wisdom as the
physics station. Look is `PointerLock` (click to capture the mouse); WASD adds velocity
along the camera's flattened forward/side vectors; Space sets upward velocity when on the
floor.

**Try it:** click, then WASD + mouse to walk the level and Space to jump up the stairs.

---

## Station 11 — postprocessing (bloom)

**Concept:** the picture isn't finished when the scene is drawn — you can run it through
image filters. **Graduation question:** why is postprocessing a *chain of passes*?

`createViewer` normally calls `renderer.render()`; here we hand it a `renderOverride` so an
`EffectComposer` drives the draw instead (`src/stations/11-bloom.ts`):

```ts
const viewer = createViewer(container, { renderOverride: () => composer?.render() });
composer = new EffectComposer(viewer.renderer);
composer.addPass(new RenderPass(viewer.scene, viewer.camera)); // 1. draw scene → texture
composer.addPass(new UnrealBloomPass(size, 0.9, 0.5, 0.0));     // 2. bright→blur→add
composer.addPass(new OutputPass());                            // 3. tonemap → screen
```

**Reading it — the answer:** each pass renders into an offscreen texture that the next pass
reads. `RenderPass` draws the scene to a texture; `UnrealBloomPass` extracts the bright
pixels, blurs them, and adds them back (that's the glow); `OutputPass` tone-maps to the
screen. Glow only appears where `emissiveIntensity` pushes pixels bright enough for the
threshold to catch. (This is the one place we extended `viewer.ts` — a `renderOverride`
hook so a station can replace the draw call.)

**Try it:** drag the bloom slider; lower `emissiveIntensity` on the shapes and watch the
glow fade.

---

## Station 12 — shadows

**Concept:** a shadow map is the scene rendered *from the light's viewpoint*, storing depth.
**Graduation question:** why are shadows an extra render pass?

```ts
viewer.renderer.shadowMap.enabled = true;
const light = new THREE.DirectionalLight(0xffffff, 3);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 40 });
mesh.castShadow = true;   ground.receiveShadow = true;
```

**Reading it — the answer:** to know if a point is shadowed, three renders the scene once
*from the light* into a depth texture (the shadow map). Then while shading the ground, each
pixel compares its distance-to-light against that stored depth: farther → something blocks
it → in shadow. So shadows literally cost a second render of all casters. The trade-offs fall
out of that: `mapSize` is the shadow texture resolution (sharper but costlier), the
`shadow.camera` ortho box must tightly wrap the scene (too big → blocky shadows), and
`shadow.bias` nudges the comparison to avoid self-shadow acne.

**Try it:** toggle "cast shadows"; shrink `mapSize` to `256` to see the resolution trade-off.

---

## Station 13 — transmission / glass

**Concept:** *transmission* lets light pass through and bend (refract); *dispersion* splits it
by wavelength (rainbow edges). **Graduation question:** why does glass need an environment +
visible background to look like glass?

```ts
viewer.scene.environment = envTex;   // reflections + what gets refracted
viewer.scene.background = envTex;     // so the refraction is actually visible
// DispersionTest.glb already uses MeshPhysicalMaterial: transmission + ior + dispersion
```

**Reading it — the answer:** unlike `opacity` (which just fades a surface toward
transparent), `transmission` simulates light traveling *through* the material and bending by
its `ior`. But "bending light" only shows up as distortion of whatever is *behind* the
glass — so with no environment/background there's nothing to refract and it looks flat. We
reuse station 06's `RoomEnvironment` for both the reflections and the refracted backdrop.

**Try it:** comment out `scene.background` and notice the refraction loses its reference;
spin the model to watch the dispersion fringes shift.

---

## Station 14 — morph-target flock

**Concept:** another way to animate a mesh — no skeleton. **Graduation question:** how do you
flap a wing with no bones? (Blend the vertices toward a stored target shape.)

```ts
const mixer = new THREE.AnimationMixer(obj);
mixer.clipAction(gltf.animations[0]).play();  // a morph-target (blend-shape) clip
viewer.onFrame((t, delta) => { mixer.update(delta); /* + fly in a circle */ });
```

**Reading it:** station 07 rotated *bones* to deform the soldier. These birds have no
skeleton — the flap clip drives **morph target influences**, blending each vertex between
its rest position and a stored "wings-up" target. The driving code is the *same*
`AnimationMixer` + `mixer.update(delta)` as station 07; only the underlying deformation
differs (vertex blend vs. bone transform). We load three species, clone each into a small
flock, and fly them on circular orbits.

**Try it:** change the orbit `radius`/`speed`/count, or `mixer.timeScale` to slow the flap.

---

## How to study

| Station | Graduation question |
| --- | --- |
| 00 render-loop | What makes the cube spin the same speed at any frame rate? |
| 01 manifold | What does `boolean subtract` produce, and what does the renderer receive? |
| 02 glTF | How do `scene → node → mesh → accessor → buffer` relate inside a `.glb`? |
| 03 sdf | Why is it safe to step by "distance to the nearest surface" each iteration? |
| 04 motion | What one function connects the timeline to the cube? |
| 05 physics | Why step physics in fixed 1/60s chunks instead of once per frame? |
| 06 pbr | Why does PBR *need* an environment map? |
| 07 animation | How does `mixer.update(delta)` mesh with the render loop? |
| 08 performance | Why does a BVH make raycasting a dense mesh ~100× faster? |
| 09 r3f | How does imperative three.js map onto a declarative JSX tree? |
| 10 fps | What does the Octree speed up (vs the BVH in 08)? |
| 11 bloom | Why is postprocessing a chain of passes? |
| 12 shadows | Why are shadows an extra render pass? |
| 13 glass | Why does glass need a visible background to look like glass? |
| 14 birds | How do you flap a wing with no skeleton? |

Run it:

```bash
npm run gen:glb   # bake public/models/building.glb (needed by station 02)
npm run dev       # http://localhost:5173 — switch stations from the top nav
```

The fastest way to learn each station is to change one number and reload. Every station ends
with a **Try it** above — start there.
