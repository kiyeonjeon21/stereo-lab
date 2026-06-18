// Station 03 — SDF raymarching.
// There is NO geometry here. Every pixel runs this program independently, shoots
// a ray into a math-defined world, and marches along it until a distance field
// says "you hit something." The whole 3D scene is a single function: map().

precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform vec4  iMouse;

// ---------------------------------------------------------------------------
// Signed distance functions: each returns the distance from point p to a shape.
// Negative inside, zero on the surface, positive outside.
// ---------------------------------------------------------------------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdPlane(vec3 p, float h) {
  return p.y - h;
}

// Smooth minimum (iquilezles): blends two SDFs so they melt together instead of
// intersecting hard. k controls the blend radius.
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ---------------------------------------------------------------------------
// Hash + value noise — a touch of "noise" for the floor coloring.
// ---------------------------------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ---------------------------------------------------------------------------
// The scene. Returns distance to the nearest surface from point p.
// We morph a sphere and a box together, the blend driven by time.
// ---------------------------------------------------------------------------
float map(vec3 p) {
  // gentle bob so the blob breathes
  vec3 c = p - vec3(0.0, 1.0 + 0.1 * sin(iTime), 0.0);

  float sphere = sdSphere(c - vec3(-0.6, 0.0, 0.0), 0.9);
  float box = sdBox(c - vec3(0.6, 0.0, 0.0), vec3(0.7));

  // blend amount oscillates: watch the two shapes flow in and out of each other
  float k = 0.5 + 0.45 * sin(iTime * 0.6);
  float blob = opSmoothUnion(sphere, box, k);

  float ground = sdPlane(p, 0.0);
  return min(blob, ground);
}

// Surface normal via the gradient of the distance field (tetrahedron trick).
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0008, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

// March a ray from ro along rd until we hit something (or give up).
float raymarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.001 || t > 40.0) break; // hit, or escaped to the void
    t += d;                           // safe to step by the distance to nearest surface
  }
  return t;
}

// Soft shadows (iquilezles): march toward the light, the closer the ray skims a
// surface the darker the penumbra.
float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + rd * t);
    if (h < 0.001) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.4);
    if (t > 20.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  // pixel coords → centered, aspect-corrected screen coords in [-1,1]
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // --- orbiting camera: drag the mouse to look around, else auto-rotate ---
  float ang = iTime * 0.2;
  float elev = 0.5;
  if (iMouse.z > 0.5) {
    ang = (iMouse.x / iResolution.x - 0.5) * 6.2831;
    elev = (iMouse.y / iResolution.y) * 1.4 + 0.1;
  }
  float radius = 5.0;
  vec3 ro = vec3(cos(ang) * radius, 1.0 + 2.5 * sin(elev), sin(ang) * radius);
  vec3 target = vec3(0.0, 1.0, 0.0);

  // build a camera basis and the ray direction for this pixel
  vec3 fwd = normalize(target - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * fwd);

  vec3 lightDir = normalize(vec3(0.8, 0.9, 0.2));
  vec3 col = vec3(0.0);

  float t = raymarch(ro, rd);
  if (t < 40.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);

    float diff = clamp(dot(n, lightDir), 0.0, 1.0);
    float sky = clamp(0.5 + 0.5 * n.y, 0.0, 1.0); // hemisphere ambient
    float sh = softShadow(p, lightDir, 16.0);

    // material: warm blob vs noisy checker-ish floor
    vec3 mat;
    if (p.y < 0.01) {
      float n2 = noise(p.xz * 1.5);
      mat = mix(vec3(0.12, 0.13, 0.16), vec3(0.22, 0.24, 0.28), n2);
    } else {
      mat = vec3(1.0, 0.55, 0.25);
    }

    col = mat * (0.25 * sky + 1.1 * diff * sh);
  } else {
    // sky gradient background
    col = mix(vec3(0.04, 0.05, 0.07), vec3(0.10, 0.13, 0.18), uv.y + 0.5);
  }

  col = pow(col, vec3(0.4545)); // gamma correction (linear → sRGB-ish)
  gl_FragColor = vec4(col, 1.0);
}
