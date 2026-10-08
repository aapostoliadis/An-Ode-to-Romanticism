import { COPY_FRAG, DISP_FRAG, PRESENT_FRAG, ROOM_FRAG, SCENE_FRAG, VERT } from './shaders.js';

const TRANSITION_IDS = ['brush', 'bleed', 'light', 'flow', 'dark', 'tiles'];

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function makeProgram(gl, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    uniforms[info.name.replace(/\[0\]$/, '')] = {
      loc: gl.getUniformLocation(prog, info.name),
      type: info.type,
    };
  }
  return { prog, uniforms };
}

function setUniforms(gl, program, values) {
  for (const name in values) {
    const u = program.uniforms[name];
    if (!u) continue;
    const v = values[name];
    switch (u.type) {
      case gl.FLOAT:
        gl.uniform1f(u.loc, v);
        break;
      case gl.FLOAT_VEC2:
        gl.uniform2fv(u.loc, v);
        break;
      case gl.FLOAT_VEC3:
        gl.uniform3fv(u.loc, v);
        break;
      case gl.FLOAT_VEC4:
        gl.uniform4fv(u.loc, v);
        break;
      default:
        gl.uniform1i(u.loc, v);
    }
  }
}

function hexToVec3(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    this.programs = {
      scene: makeProgram(gl, SCENE_FRAG),
      disp: makeProgram(gl, DISP_FRAG),
      present: makeProgram(gl, PRESENT_FRAG),
      room: makeProgram(gl, ROOM_FRAG),
      copy: makeProgram(gl, COPY_FRAG),
    };

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.placeholder = this.createTexture(1, 1, { data: new Uint8Array([10, 9, 8, 255]) });
    this.paint = null;
    this.ana = null;
    this.depth = null;
    this.text = this.createTexture(1, 1, { data: new Uint8Array([0, 0, 0, 0]) });
    this.scene = null;
    this.prev = null;
    this.disp = [];
    this.sceneSize = [0, 0];
  }

  createTexture(w, h, opts = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internal = opts.internal ?? gl.RGBA8;
    const format = opts.format ?? gl.RGBA;
    const type = opts.type ?? gl.UNSIGNED_BYTE;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, opts.data ?? null);
    const filter = opts.filter ?? gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const wrap = opts.wrap ?? gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return tex;
  }

  createTarget(w, h, float = false) {
    const gl = this.gl;
    const tex = float
      ? this.createTexture(w, h, { internal: gl.RGBA16F, type: gl.HALF_FLOAT })
      : this.createTexture(w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  deleteTarget(t) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  // Scene buffers follow the display, except in the quarry view where the
  // frame is a 2:1 panorama wrapped around the hall.
  resize(cssW, cssH, dpr, quality, mode) {
    const gl = this.gl;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    let sw;
    let sh;
    if (mode === 'room') {
      sw = Math.round(2048 * quality);
      sh = Math.round(1024 * quality);
    } else {
      const cap = Math.min(1, 2560 / (w * quality));
      sw = Math.max(2, Math.round(w * quality * cap));
      sh = Math.max(2, Math.round(h * quality * cap));
    }
    if (sw !== this.sceneSize[0] || sh !== this.sceneSize[1]) {
      // Keep the frozen frame, a transition may be running.
      const oldPrev = this.prev;
      this.deleteTarget(this.scene);
      this.scene = this.createTarget(sw, sh);
      this.prev = this.createTarget(sw, sh);
      if (oldPrev) {
        this.bind(0, oldPrev.tex);
        this.draw(this.programs.copy, this.prev, { uSrc: 0 });
        this.deleteTarget(oldPrev);
      }
      this.sceneSize = [sw, sh];
      for (const d of this.disp) this.deleteTarget(d);
      const dw = 320;
      const dh = Math.max(2, Math.round((dw * sh) / sw));
      this.disp = [this.createTarget(dw, dh, this.floatTargets), this.createTarget(dw, dh, this.floatTargets)];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!this.floatTargets) {
        // Encoded zero for 8-bit displacement targets.
        for (const d of this.disp) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo);
          gl.clearColor(0.5, 0.5, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    }
  }

  get sceneAspect() {
    return this.sceneSize[0] / this.sceneSize[1];
  }

  setPainting(source, analysis) {
    const gl = this.gl;
    for (const t of [this.paint, this.ana, this.depth]) if (t) gl.deleteTexture(t);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    this.paint = tex;
    this.ana = this.createTexture(analysis.width, analysis.height, { data: analysis.ana });
    this.depth = this.createTexture(analysis.width, analysis.height, {
      internal: gl.R8,
      format: gl.RED,
      data: analysis.depth,
    });
    this.paintAspect = analysis.aspect;
  }

  setText(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.text);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  bind(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex ?? this.placeholder);
  }

  draw(program, target, uniforms) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
    gl.useProgram(program.prog);
    setUniforms(gl, program, uniforms);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Freeze the current frame so a transition can dissolve it.
  capturePrev() {
    if (!this.scene) return;
    this.bind(0, this.scene.tex);
    this.draw(this.programs.copy, this.prev, { uSrc: 0 });
  }

  render(st) {
    if (!this.scene || !this.paint) return;
    const r = st.recipe;

    // 1. Pointer displacement field (ping-pong).
    const [dSrc, dDst] = this.disp;
    this.bind(0, dSrc.tex);
    this.draw(this.programs.disp, dDst, {
      uPrev: 0,
      uMouse: st.mouse,
      uVel: st.mouseVel,
      uRadius: 0.08,
      uDecay: 0.965,
      uAspect: this.sceneAspect,
      uEncoded: this.floatTargets ? 0 : 1,
    });
    this.disp = [dDst, dSrc];

    // 2. The animated painting.
    this.bind(0, this.paint);
    this.bind(1, this.ana);
    this.bind(2, this.depth);
    this.bind(3, dDst.tex);
    this.bind(4, this.prev.tex);
    const windRad = (r.windAngle * Math.PI) / 180;
    this.draw(this.programs.scene, this.scene, {
      uPaint: 0,
      uAna: 1,
      uDepth: 2,
      uDisp: 3,
      uPrevFrame: 4,
      uRes: this.sceneSize,
      uTime: st.time,
      uView: st.view,
      uParallax: st.parallax,
      uAspect: this.paintAspect,
      uFlow: r.flow,
      uFlowSpeed: r.flowSpeed,
      uFlowFollow: r.flowFollow,
      uWind: [Math.cos(windRad) * r.wind, Math.sin(windRad) * r.wind],
      uVortex: [r.vortexX, r.vortexY, r.vortex, r.vortexRadius],
      uHorizon: r.horizon,
      uWater: r.water,
      uMist: r.mist,
      uSun: [r.sunX, r.sunY],
      uSunColor: hexToVec3(r.sunColor),
      uGlow: r.glow,
      uRays: r.rays,
      uBreathe: r.breathe,
      uGrade: r.grade,
      uSmoke: [r.smokeX, r.smokeY, r.smoke],
      uSmokeColor: hexToVec3(r.smokeColor),
      uRain: r.rain,
      uRainAngle: (r.rainAngle * Math.PI) / 180,
      uSnow: r.snow,
      uEmbers: r.embers,
      uFire: r.fire,
      uAudio: st.audio,
      uReveal: st.reveal,
      uTrans: st.transition,
      uTransType: Math.max(0, TRANSITION_IDS.indexOf(st.transitionType)),
      uCanvas: [0.035, 0.03, 0.026],
    });

    // 3. Present: flat projection or the quarry hall.
    this.bind(0, this.scene.tex);
    this.bind(1, this.text);
    const common = {
      uFrame: 0,
      uText: 1,
      uTextRect: st.textRect,
      uTextAlpha: st.textAlpha,
      uRes: [this.canvas.width, this.canvas.height],
      uTime: st.time,
    };
    if (st.mode === 'room') {
      this.draw(this.programs.room, null, {
        ...common,
        uLook: st.look,
        uEye: [0, 1.7, 3.5],
        uFov: st.fov,
      });
    } else {
      this.draw(this.programs.present, null, { ...common, uVignette: 0.55, uGrain: 0.025 });
    }
  }
}
