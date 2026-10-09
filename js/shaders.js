// GLSL for every pass. The scene shader is where the reverse-engineered
// techniques live; each block is commented with the effect it reproduces.

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s / 0.875;
}
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
// exp(-(x/w)^2) written out, since pow is undefined for negative bases.
float gauss(float x, float w) {
  float k = x / w;
  return exp(-k * k);
}
vec3 screen(vec3 a, vec3 b) {
  return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0));
}
`;

export const SCENE_FRAG = `${COMMON}
uniform sampler2D uPaint;
uniform sampler2D uAna;
uniform sampler2D uDepth;
uniform sampler2D uDisp;
uniform sampler2D uPrevFrame;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uView;
uniform vec2 uParallax;
uniform float uAspect;
uniform float uFlow;
uniform float uFlowSpeed;
uniform float uFlowFollow;
uniform vec2 uWind;
uniform vec4 uVortex;
uniform float uHorizon;
uniform float uWater;
uniform float uMist;
uniform vec2 uSun;
uniform vec3 uSunColor;
uniform float uGlow;
uniform float uRays;
uniform float uBreathe;
uniform float uGrade;
uniform vec4 uSmoke;
uniform vec3 uSmokeColor;
uniform float uRain;
uniform float uRainAngle;
uniform float uSnow;
uniform float uEmbers;
uniform float uFire;
uniform float uAudio;
uniform float uReveal;
uniform float uTrans;
uniform int uTransType;
uniform vec3 uCanvas;
uniform sampler2D uLayer0;
uniform sampler2D uLayer1;
uniform sampler2D uLayer2;
uniform int uElemCount;
uniform vec4 uElemSrc[3];
uniform vec4 uElemRef[3];
uniform vec4 uElemXf[3];
uniform vec4 uElemBlur[3];

vec2 toIso(vec2 p) { return vec2(p.x * uAspect, p.y); }
vec2 fromIso(vec2 d) { return vec2(d.x / uAspect, d.y); }

// Guide field: wind everywhere, replaced by a spiral inside the vortex.
vec2 guideAt(vec2 p) {
  vec2 g = uWind;
  if (uVortex.z > 0.0) {
    vec2 d = toIso(p - uVortex.xy);
    float r = length(d) + 1e-4;
    float fall = exp(-(r * r) / (uVortex.w * uVortex.w));
    vec2 tang = vec2(-d.y, d.x) / r;
    vec2 spiral = (tang - d / r * 0.22) * uVortex.z * 1.4;
    g = mix(g, spiral, clamp(fall * 1.3, 0.0, 1.0));
  }
  return g;
}

// Technique 1, "the paint moves along its own brushstrokes": the guide is
// projected onto the local stroke direction found by the structure tensor.
// d * dot(d, g) is invariant to the 180 degree ambiguity of a stroke.
vec2 flowAt(vec2 p, vec4 ana) {
  vec2 c2 = ana.rg * 2.0 - 1.0;
  float ang = 0.5 * atan(c2.y, c2.x);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 g = guideAt(p);
  vec2 along = dir * dot(dir, g);
  float k = clamp(ana.b * uFlowFollow * 1.5, 0.0, 1.0) * smoothstep(0.05, 0.4, length(c2));
  return mix(g * 0.45, along * 1.25, k);
}

// Technique 8, moving elements: a cut-out layer drawn back over the clean
// plate at its animated position, scale and angle, with motion blur along
// its velocity. ref = (centre x, centre y, alpha, layer width in pixels),
// xf = (offset x, offset y, scale, rotation), blur.zw = pivot offset from
// the centre (a boat rocks about its waterline).
vec4 elementColor(sampler2D layer, vec4 src, vec4 ref, vec4 xf, vec4 blur, vec2 p) {
  vec2 piv = ref.xy + blur.zw;
  vec2 q = piv + fromIso(rot(-xf.w) * toIso(p - piv - xf.xy) / xf.z);
  float screenTexel = uView.z / uRes.x / xf.z;
  float layerTexel = src.z / ref.w;
  float lod = log2(max(screenTexel / layerTexel, 1.0));
  vec4 acc = vec4(0.0);
  for (int k = -2; k <= 2; k++) {
    vec2 l = (q - blur.xy * float(k) * 0.5 / xf.z - src.xy) / src.zw;
    float inside = step(0.0, l.x) * step(0.0, l.y) * step(l.x, 1.0) * step(l.y, 1.0);
    vec4 t = textureLod(layer, clamp(l, 0.0, 1.0), lod) * inside;
    acc += vec4(t.rgb * t.a, t.a);
  }
  acc *= 0.2;
  return vec4(acc.rgb / max(acc.a, 1e-4), acc.a * ref.z);
}

float rainLayer(vec2 q, float scale, float speed, float seed) {
  q = rot(uRainAngle) * q * scale;
  q.y -= uTime * speed;
  vec2 gv = vec2(q.x, q.y / 6.0);
  vec2 id = floor(gv);
  vec2 f = fract(gv);
  float h = hash12(id + seed);
  float on = step(0.45, hash12(id * 1.37 + seed * 3.1));
  float x = abs(f.x - (0.15 + 0.7 * h));
  float y = fract(f.y + h * 13.0);
  return on * (1.0 - smoothstep(0.0, 0.05, x)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.2, 0.7, y));
}

// Snow and spray caught in the vortex: particles live on rings that each
// rotate rigidly, so the swirl never shears into noise over time.
float vortexFlakes(vec2 si, vec2 c, float scale, float seed) {
  vec2 d = si - c;
  float r = length(d) * scale;
  float ring = floor(r);
  float rr = fract(r);
  float circ = max(6.0, floor(6.2831 * (ring + 0.5)));
  float omega = uVortex.z * (0.35 + 0.9 / (ring / scale + 0.2)) * (0.8 + 0.4 * hash12(vec2(ring, seed)));
  float aa = (atan(d.y, d.x) / 6.2831 + 0.5 + uTime * omega * 0.02) * circ;
  float id = mod(floor(aa), circ);
  float fa = fract(aa);
  vec2 key = vec2(id, ring) + seed;
  vec2 o = hash22(key) * 0.6 + 0.2;
  vec2 lp = vec2((fa - o.x) * 6.2831 * (ring + 0.5) / circ, rr - o.y);
  float sz = 0.06 + 0.09 * hash12(key * 1.7);
  return step(0.55, hash12(key * 3.3)) * (1.0 - smoothstep(sz * 0.2, sz, length(lp)));
}

float driftFlakes(vec2 si, float scale, float seed) {
  vec2 q = si * scale;
  q -= (uWind * 0.6 + vec2(0.0, 0.35)) * uTime * scale * 0.15;
  q.x += sin(q.y * 0.5 + seed) * 0.3;
  vec2 id = floor(q);
  vec2 f = fract(q);
  vec2 o = hash22(id + seed * 2.0) * 0.6 + 0.2;
  float sz = 0.045 + 0.075 * hash12(id * 1.3 + seed);
  return step(0.5, hash12(id + seed)) * (1.0 - smoothstep(sz * 0.2, sz, length(f - o)));
}

float sparks(vec2 q, float scale, float seed) {
  vec2 g = q * scale;
  g.y += uTime * 0.6 * (1.0 + seed * 0.3);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float h = hash12(id + seed);
  vec2 o = hash22(id + seed) * 0.8 + 0.1;
  o.x += sin(uTime * 2.0 + h * 30.0) * 0.08;
  float sz = 0.03 + 0.05 * hash12(id * 2.1 + seed);
  float flicker = 0.5 + 0.5 * sin(uTime * (6.0 + h * 8.0) + h * 40.0);
  return step(0.6, h) * (1.0 - smoothstep(0.0, sz, length(f - o))) * flicker;
}

vec3 transition(vec3 cur, vec2 s, vec2 p, float lic) {
  float tp = uTrans;
  vec3 prev = texture(uPrevFrame, vUv).rgb;
  float sa = uRes.x / uRes.y;
  vec2 si = vec2(s.x * sa, s.y);
  if (uTransType == 0) {
    // Brushstroke wipe: the new canvas is painted over the old one along
    // its own stroke map, with a wet highlight at the leading edge.
    float order = mix(lic, fbm3(toIso(p) * 5.0), 0.45);
    float key = order * 0.45 + (s.x * 0.85 + s.y * 0.15) * 0.55;
    float r = tp * 1.25 - 0.12;
    float m = 1.0 - smoothstep(-0.035, 0.0, key - r);
    float rim = gauss(key - r + 0.017, 0.012);
    return mix(prev, cur, m) + uSunColor * rim * 0.18 * (1.0 - tp);
  }
  if (uTransType == 1) {
    // Watercolour bleed from a few seeds, pigment pooling at the wet edge.
    vec2 w = vec2(fbm3(si * 2.0 + 1.7), fbm3(si * 2.0 + 9.2));
    float n = fbm(si * 3.0 + w * 1.5);
    float d = min(min(length(si - vec2(0.35 * sa, 0.4)), length(si - vec2(0.8 * sa, 0.65))),
                  length(si - vec2(0.55 * sa, 0.2)));
    float key = d * 0.75 + n * 0.5;
    float e = key - tp * 1.15;
    float m = 1.0 - smoothstep(-0.03, 0.0, e);
    float edge = gauss(e + 0.03, 0.03);
    return mix(prev, cur, m) * (1.0 - edge * 0.35 * (1.0 - tp * 0.5));
  }
  if (uTransType == 2) {
    // Flood of light, the signature Turner transition.
    float k = smoothstep(0.3, 0.7, tp);
    float flash = sin(clamp(tp, 0.0, 1.0) * 3.14159);
    vec3 c = mix(prev, cur, k);
    return mix(c, uSunColor * 1.15 + 0.15, flash * flash * 0.85);
  }
  if (uTransType == 3) {
    // The previous painting melts and runs down the walls.
    float n = fbm3(si * 3.0 + vec2(0.0, tp * 2.0));
    float drop = tp * tp * (0.6 + n * 0.9);
    vec2 uvp = vUv + vec2((fbm3(si * 2.0 + 4.0) - 0.5) * 0.08 * tp, drop);
    vec3 pv = texture(uPrevFrame, uvp).rgb;
    float a = 1.0 - smoothstep(0.35, 0.95, tp + n * 0.25 - 0.1);
    a *= step(uvp.y, 1.0);
    return mix(cur, pv, a);
  }
  if (uTransType == 4) {
    vec3 c = mix(prev, vec3(0.0), smoothstep(0.0, 0.5, tp));
    return mix(c, cur, smoothstep(0.5, 1.0, tp));
  }
  // Mosaic: the wall breaks into tiles that flip to reveal the next work.
  vec2 grid = vec2(14.0, ceil(14.0 / sa));
  vec2 gs = s * grid;
  vec2 id = floor(gs);
  vec2 f = fract(gs);
  float start = hash12(id + 3.0) * 0.35 + length((id + 0.5) / grid - 0.5) * 0.45;
  float lt = clamp((tp - start) / 0.2, 0.0, 1.0);
  float sx = abs(cos(lt * 3.14159));
  float fx = (f.x - 0.5) / max(sx, 1e-3) + 0.5;
  float inside = step(0.0, fx) * step(fx, 1.0);
  vec2 ss = (id + vec2(fx, f.y)) / grid;
  vec3 pv = texture(uPrevFrame, vec2(ss.x, 1.0 - ss.y)).rgb;
  vec3 face = lt < 0.5 ? pv : cur;
  return mix(vec3(0.015), face * (0.55 + 0.45 * sx), inside);
}

void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  vec2 p = uView.xy + s * uView.zw;
  float t = uTime;

  // Visitor interaction: the pointer stirs the wet paint.
  vec2 disp = texture(uDisp, vUv).xy;
  p -= disp * uView.zw;

  // Technique 2, 2.5D parallax: pixels slide by their pseudo depth when the
  // camera or pointer moves, which separates planes without cut-out layers.
  float depth = texture(uDepth, p).r;
  p += (depth - 0.5) * uParallax;

  // Technique 3, water: perspective-correct ripples below the horizon.
  float dy = p.y - uHorizon;
  float below = smoothstep(-0.01, 0.05, dy);
  if (uWater > 0.0 && dy > 0.0) {
    float z = 0.05 / (dy + 0.02);
    vec2 wp = vec2((p.x - 0.5) * uAspect * z * 4.0, z * 3.0);
    vec2 rip = vec2(vnoise(wp * 1.7 + vec2(t * 0.25, -t * 0.6)),
                    vnoise(wp * 1.7 + vec2(7.1 - t * 0.2, 3.3 - t * 0.5))) - 0.5;
    rip += 0.5 * (vec2(vnoise(wp * 4.1 + vec2(-t * 0.4, t * 0.9)),
                       vnoise(wp * 4.3 + vec2(2.0, t * 0.8))) - 0.5);
    float amp = uWater * 0.012 * smoothstep(0.0, 0.06, dy) * (0.4 + dy * 2.5);
    p += rip * amp * vec2(1.0 / uAspect, 0.5);
  }

  // Flow-map advection: two phases half a cycle apart, cross-faded so the
  // reset of one phase is always hidden. The per-pixel phase comes from the
  // stroke map, so neighbouring strokes breathe out of step.
  vec4 ana = texture(uAna, p);
  vec2 f = flowAt(p, ana);
  float ph = t * uFlowSpeed + ana.a * 0.6;
  float ph0 = fract(ph);
  float ph1 = fract(ph + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
  vec2 off = fromIso(f) * uFlow * mix(1.0, 0.55, below) * 0.045;
  vec3 col = texture(uPaint, p - off * (ph0 - 0.5)).rgb * w0
           + texture(uPaint, p - off * (ph1 - 0.5)).rgb * (1.0 - w0);

  if (uElemCount > 0) {
    vec4 e = elementColor(uLayer0, uElemSrc[0], uElemRef[0], uElemXf[0], uElemBlur[0], p);
    col = mix(col, e.rgb, e.a);
  }
  if (uElemCount > 1) {
    vec4 e = elementColor(uLayer1, uElemSrc[1], uElemRef[1], uElemXf[1], uElemBlur[1], p);
    col = mix(col, e.rgb, e.a);
  }
  if (uElemCount > 2) {
    vec4 e = elementColor(uLayer2, uElemSrc[2], uElemRef[2], uElemXf[2], uElemBlur[2], p);
    col = mix(col, e.rgb, e.a);
  }

  vec2 q = toIso(p);

  // Technique 4, atmosphere: domain-warped mist tinted with the local
  // colour of the painting (a very blurred mip level), densest at the horizon.
  if (uMist > 0.0) {
    vec2 drift = uWind * t * 0.02 + vec2(t * 0.01, 0.0);
    vec2 warp = vec2(fbm3(q * 1.3 + drift + 3.1), fbm3(q * 1.3 - drift + 8.7));
    float m = fbm(q * 2.4 + warp * 1.4 - drift * 2.0);
    float band = gauss(p.y - uHorizon, 0.25) * 0.75 + (1.0 - depth) * 0.35;
    float mist = smoothstep(0.42, 0.85, m) * band * uMist;
    vec3 mistCol = textureLod(uPaint, p, 6.0).rgb * 1.12 + 0.04;
    col = mix(col, mistCol, clamp(mist, 0.0, 0.8));
  }

  // Smoke or steam plume rising from a point and bending with the wind.
  if (uSmoke.z > 0.0) {
    vec2 rel = toIso(p - uSmoke.xy) / uSmoke.w;
    float h = -rel.y;
    if (h > -0.03) {
      float x = rel.x - (uWind.x * h * h * 1.5 + 0.06 * h);
      float width = 0.012 + max(h, 0.0) * 0.22;
      float n = fbm(vec2(x * 9.0, h * 6.0 - t * 0.35));
      float d = exp(-x * x / (width * width)) * smoothstep(-0.03, 0.02, h) * exp(-max(h, 0.0) * 2.2);
      float dens = clamp(d * (n * 1.6 - 0.25), 0.0, 1.0) * uSmoke.z;
      col = mix(col, uSmokeColor * (0.8 + 0.4 * n), dens * 0.85);
    }
  }

  // Fire: warm, bright areas flicker and glow.
  if (uFire > 0.0) {
    vec3 base = textureLod(uPaint, p, 2.0).rgb;
    float warm = smoothstep(0.06, 0.32, base.r - base.b) * smoothstep(0.3, 0.75, luma(base));
    float fl = fbm(vec2(q.x * 7.0, q.y * 5.0 + t * 1.3));
    float fl2 = vnoise(vec2(q.x * 20.0, t * 6.0));
    col *= 1.0 + uFire * warm * ((fl - 0.45) * 0.9 + (fl2 - 0.5) * 0.25);
    col += uFire * warm * vec3(1.0, 0.42, 0.08) * 0.12 * fl;
  }

  // Technique 5, light: a breathing sun glow plus god rays made by marching
  // from each pixel toward the sun through a blurred bright pass.
  float breathe = 1.0 + uBreathe * 0.12 * sin(t * 0.45) + uAudio * 0.35;
  vec2 sd = toIso(p - uSun);
  float sr = length(sd);
  if (uGlow > 0.0) {
    col = screen(col, uSunColor * (exp(-sr * sr / 0.0025) * 0.6 + exp(-sr / 0.09) * 0.25 + exp(-sr / 0.35) * 0.07)
         * uGlow * breathe);
  }
  if (uRays > 0.0) {
    vec2 stepv = (uSun - p) / 24.0;
    vec2 rq = p + stepv * hash12(gl_FragCoord.xy);
    float decay = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      rq += stepv;
      vec3 sc = textureLod(uPaint, rq, 3.0).rgb;
      acc += sc * max(0.0, luma(sc) - 0.62) * decay;
      decay *= 0.94;
    }
    float a = atan(sd.y, sd.x);
    float flick = 0.8 + 0.2 * sin(t * 0.35 + a * 7.0) * sin(t * 0.21 - a * 3.0);
    col = screen(col, acc / 24.0 * uRays * 3.2 * breathe * flick);
  }

  // Technique 6, procedural elements: rain, snow in the vortex, embers.
  float sa = uRes.x / uRes.y;
  vec2 si = vec2(s.x * sa, s.y);
  if (uRain > 0.0) {
    float r = rainLayer(si, 18.0, 22.0, 1.0) * 0.5 + rainLayer(si, 30.0, 34.0, 2.0) * 0.35
            + rainLayer(si, 50.0, 52.0, 3.0) * 0.25;
    col = mix(col, textureLod(uPaint, p, 5.0).rgb * 1.25 + 0.15, clamp(r * uRain, 0.0, 0.8));
  }
  if (uSnow > 0.0) {
    float fl;
    if (uVortex.z > 0.05) {
      vec2 vc = (uVortex.xy - uView.xy) / uView.zw;
      vc.x *= sa;
      fl = vortexFlakes(si, vc, 11.0, 1.0) * 0.9 + vortexFlakes(si, vc, 19.0, 2.0) * 0.6
         + vortexFlakes(si, vc, 32.0, 3.0) * 0.4;
    } else {
      fl = driftFlakes(si, 11.0, 1.0) * 0.9 + driftFlakes(si, 19.0, 2.0) * 0.6 + driftFlakes(si, 32.0, 3.0) * 0.4;
    }
    vec3 flakeCol = mix(vec3(0.93, 0.91, 0.86), textureLod(uPaint, p, 5.0).rgb * 1.4, 0.3);
    col = mix(col, flakeCol, clamp(fl * uSnow, 0.0, 0.85));
  }
  if (uEmbers > 0.0) {
    vec3 b = textureLod(uPaint, p + vec2(0.0, 0.06), 4.0).rgb;
    float warmMask = smoothstep(0.05, 0.3, b.r - b.b) * smoothstep(0.25, 0.6, luma(b));
    float e = sparks(q, 25.0, 1.0) + sparks(q, 45.0, 2.0) * 0.7 + sparks(q, 80.0, 3.0) * 0.5;
    col += vec3(1.0, 0.55, 0.18) * e * uEmbers * warmMask * 1.6;
  }

  col *= 1.0 + (breathe - 1.0) * 0.35;
  col = mix(col, col * vec3(1.06, 1.0, 0.9) + vec3(0.02, 0.01, 0.0), uGrade);

  // Outside the canvas (fit mode) the mirrored painting is dimmed.
  float outside = max(max(-p.x, p.x - 1.0), max(-p.y, p.y - 1.0));
  col *= mix(1.0, 0.28, smoothstep(0.015, 0.03, outside));

  // Technique 7, the painting paints itself: first the colour washes, then
  // the strokes, sweeping out from the light source along the stroke map.
  if (uReveal < 1.0) {
    float order = mix(ana.a, fbm3(q * 5.0), 0.5);
    float sweep = clamp(length(toIso(p - uSun)) / 1.1, 0.0, 1.0);
    float key = order * 0.4 + sweep * 0.6;
    float r1 = uReveal * 1.45;
    float r2 = uReveal * 1.4 - 0.36;
    float m1 = 1.0 - smoothstep(-0.05, 0.0, key - r1);
    float m2 = 1.0 - smoothstep(-0.025, 0.0, key - r2);
    vec3 wash = textureLod(uPaint, p, 4.5).rgb;
    wash = mix(vec3(luma(wash)), wash, 0.8) * 1.05;
    vec3 rc = mix(uCanvas, wash, m1);
    rc = mix(rc, col, m2);
    rc += uSunColor * gauss(key - r2 + 0.012, 0.012) * 0.25;
    col = rc;
  }

  if (uTrans < 1.0) col = transition(col, s, p, ana.a);

  outColor = vec4(col, 1.0);
}`;

// Pointer stirring: a self-advecting, decaying displacement field.
export const DISP_FRAG = `${COMMON}
uniform sampler2D uPrev;
uniform vec2 uMouse;
uniform vec2 uVel;
uniform float uRadius;
uniform float uDecay;
uniform float uAspect;
uniform float uEncoded;

vec2 decode(vec4 v) { return uEncoded > 0.5 ? (v.xy - 0.5) * 0.5 : v.xy; }
vec4 encode(vec2 d) { return uEncoded > 0.5 ? vec4(d * 2.0 + 0.5, 0.0, 1.0) : vec4(d, 0.0, 1.0); }

void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  vec2 cur = decode(texture(uPrev, vUv));
  vec2 adv = decode(texture(uPrev, vUv - vec2(cur.x, -cur.y) * 0.35));
  vec2 d = s - uMouse;
  d.x *= uAspect;
  float g = exp(-dot(d, d) / (uRadius * uRadius));
  vec2 v = adv * uDecay + uVel * g;
  float len = length(v);
  if (len > 0.09) v *= 0.09 / len;
  if (uEncoded > 0.5 && len < 0.003) v = vec2(0.0);
  outColor = encode(v);
}`;

const OVERLAY = `
uniform sampler2D uText;
uniform vec4 uTextRect;
uniform float uTextAlpha;
vec3 overlayText(vec3 col) {
  if (uTextAlpha <= 0.0) return col;
  vec2 tuv = (vUv - uTextRect.xy) / uTextRect.zw;
  if (tuv.x < 0.0 || tuv.y < 0.0 || tuv.x > 1.0 || tuv.y > 1.0) return col;
  vec4 tx = texture(uText, vec2(tuv.x, 1.0 - tuv.y));
  return mix(col, tx.rgb, tx.a * uTextAlpha);
}
`;

export const PRESENT_FRAG = `${COMMON}
uniform sampler2D uFrame;
uniform vec2 uRes;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
${OVERLAY}
void main() {
  vec3 col = texture(uFrame, vUv).rgb;
  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  col *= mix(1.0, 1.0 - smoothstep(0.2, 1.25, length(d)), uVignette);
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
  outColor = vec4(overlayText(col), 1.0);
}`;

// The quarry: a ray-traced hall of limestone walls, pillars and visitors.
// The frame is wrapped around the hall from a central projector, mirrored
// so it is seamless, and the floor carries a darkened mirror of the walls.
export const ROOM_FRAG = `${COMMON}
uniform sampler2D uFrame;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLook;
uniform vec3 uEye;
uniform float uFov;
${OVERLAY}

const vec3 RMIN = vec3(-16.0, 0.0, -12.0);
const vec3 RMAX = vec3(16.0, 9.0, 12.0);

vec2 boxHit(vec3 ro, vec3 rd, vec3 c, vec3 h, out vec3 n) {
  vec3 m = 1.0 / rd;
  vec3 k = abs(m) * h;
  vec3 t1 = -m * (ro - c) - k;
  vec3 t2 = -m * (ro - c) + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return vec2(-1.0);
  n = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  return vec2(tN, tF);
}

float capsule(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba);
  float bard = dot(ba, rd);
  float baoa = dot(ba, oa);
  float rdoa = dot(rd, oa);
  float oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h >= 0.0) {
    float t = (-b - sqrt(h)) / a;
    float y = baoa + t * bard;
    if (y > 0.0 && y < baba) return t;
    vec3 oc = (y <= 0.0) ? oa : ro - pb;
    b = dot(rd, oc);
    c = dot(oc, oc) - r * r;
    h = b * b - c;
    if (h > 0.0) return -b - sqrt(h);
  }
  return -1.0;
}

float rock(vec3 h, vec3 n) {
  vec2 uv = abs(n.x) > 0.5 ? h.zy : (abs(n.z) > 0.5 ? h.xy : h.xz);
  float r = fbm(uv * 0.35) * 0.6 + fbm3(uv * 2.1) * 0.4;
  float cracks = (1.0 - smoothstep(0.0, 0.012, abs(fbm3(uv * 0.45) - 0.5))) * 0.12;
  return 0.78 + r * 0.3 - cracks;
}

vec3 projected(vec3 h, bool isFloor) {
  vec3 dv = h - vec3(0.0, 4.5, 0.0);
  float u = 0.5 + atan(dv.x, -dv.z) / 3.14159265;
  u = 1.0 - abs(1.0 - mod(u, 2.0));
  if (isFloor) {
    vec2 dir = normalize(dv.xz + 1e-5);
    float tx = ((dir.x > 0.0 ? RMAX.x : RMIN.x) - h.x) / dir.x;
    float tz = ((dir.y > 0.0 ? RMAX.z : RMIN.z) - h.z) / dir.y;
    float dw = min(tx, tz);
    vec3 c = texture(uFrame, vec2(u, clamp(dw / RMAX.y * 0.9, 0.0, 1.0))).rgb;
    return c * 0.5 * exp(-dw * 0.05);
  }
  return texture(uFrame, vec2(u, clamp(h.y / RMAX.y, 0.0, 1.0))).rgb;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  ndc.x *= uRes.x / uRes.y;
  float fl = 1.0 / tan(radians(uFov) * 0.5);
  vec3 rd = normalize(vec3(ndc, -fl));
  float cp = cos(uLook.y);
  float sp = sin(uLook.y);
  rd = vec3(rd.x, rd.y * cp - rd.z * sp, rd.y * sp + rd.z * cp);
  float cy = cos(uLook.x);
  float sy = sin(uLook.x);
  rd = vec3(rd.x * cy - rd.z * sy, rd.y, rd.x * sy + rd.z * cy);
  rd += vec3(1e-5);
  vec3 ro = uEye;

  vec3 n;
  vec2 room = boxHit(ro, rd, (RMIN + RMAX) * 0.5, (RMAX - RMIN) * 0.5, n);
  float tBest = room.y;
  vec3 hp = ro + rd * tBest;
  vec3 nBest = vec3(0.0);
  vec3 dist = min(abs(hp - RMIN), abs(hp - RMAX));
  if (dist.x < dist.y && dist.x < dist.z) nBest = vec3(-sign(rd.x), 0.0, 0.0);
  else if (dist.y < dist.z) nBest = vec3(0.0, -sign(rd.y), 0.0);
  else nBest = vec3(0.0, 0.0, -sign(rd.z));
  int kind = 0;

  vec3 pillars[4] = vec3[4](vec3(-8.5, 4.5, -4.0), vec3(8.5, 4.5, -4.0), vec3(-8.5, 4.5, 7.0), vec3(8.5, 4.5, 7.0));
  for (int i = 0; i < 4; i++) {
    vec3 pn;
    vec2 ph = boxHit(ro, rd, pillars[i], vec3(1.4, 4.5, 1.4), pn);
    if (ph.x > 0.0 && ph.x < tBest) {
      tBest = ph.x;
      nBest = pn;
      kind = 0;
    }
  }

  vec4 people[6] = vec4[6](vec4(-4.0, -5.0, 1.62, 0.0), vec4(3.0, -7.0, 1.78, 1.0), vec4(6.0, -1.0, 1.7, 2.0),
                           vec4(-7.0, 2.0, 1.55, 3.0), vec4(1.6, -3.2, 1.82, 4.0), vec4(-2.2, -9.0, 1.68, 5.0));
  for (int i = 0; i < 6; i++) {
    vec4 pp = people[i];
    float sway = sin(uTime * 0.3 + pp.w) * 0.05;
    vec3 base = vec3(pp.x + sway, 0.25, pp.y);
    float tb = capsule(ro, rd, base, base + vec3(0.0, pp.z - 0.55, 0.0), 0.23);
    float thd = capsule(ro, rd, base + vec3(0.0, pp.z - 0.3, 0.0), base + vec3(0.0, pp.z - 0.12, 0.0), 0.12);
    float tp = tb > 0.0 ? (thd > 0.0 ? min(tb, thd) : tb) : thd;
    if (tp > 0.0 && tp < tBest) {
      tBest = tp;
      kind = 1;
    }
  }

  vec3 h = ro + rd * tBest;
  vec3 col;
  if (kind == 1) {
    col = projected(h, false) * 0.24 + vec3(0.01);
  } else if (nBest.y > 0.5) {
    col = projected(h, true) * rock(h, nBest) + vec3(0.006);
  } else if (nBest.y < -0.5) {
    col = vec3(0.018, 0.016, 0.014) * rock(h, nBest) + projected(vec3(h.x, RMAX.y, h.z), false) * 0.03;
  } else {
    col = projected(h, false) * rock(h, nBest) * 0.96;
    col *= mix(0.65, 1.0, smoothstep(0.0, 1.4, h.y));
  }
  col = mix(col, vec3(0.012, 0.011, 0.01), 1.0 - exp(-tBest * 0.018));
  vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  col *= 1.0 - smoothstep(0.3, 1.4, length(d));
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 311.0) - 0.5) * 0.02;
  outColor = vec4(overlayText(col), 1.0);
}`;

export const COPY_FRAG = `${COMMON}
uniform sampler2D uSrc;
void main() {
  outColor = texture(uSrc, vUv);
}`;
