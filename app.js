(() => {
  const story = document.querySelector("#pilgrimage");
  const hero = document.querySelector("#scene");
  const art = document.querySelector("#artwork");
  const cursor = document.querySelector("#snitch-cursor");
  const lightCanvas = document.querySelector("#scene-light");
  const filmLayer = document.querySelector("#film-layer");
  const cloudFilm = document.querySelector("#cloud-film");
  const goldenMist = document.querySelector("#golden-mist");
  const emergenceHaze = document.querySelector("#emergence-haze");
  const pantheonFogShape = document.querySelector("#pantheon-fog-shape");
  const captions = [
    { element: document.querySelector("#caption-one"), inStart: -0.02, inEnd: 0.025, outStart: 0.22, outEnd: 0.32 },
    { element: document.querySelector("#caption-two"), inStart: 0.285, inEnd: 0.355, outStart: 0.50, outEnd: 0.60 },
    { element: document.querySelector("#caption-three"), inStart: 0.61, inEnd: 0.68, outStart: 0.71, outEnd: 0.78 }
  ];
  const normalImage = new Image();
  const silverImage = new Image();
  const colorImage = new Image();
  const finePointer = matchMedia("(pointer:fine) and (hover:hover)");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let ratio = 1;
  let lightX = 0;
  let lightY = 0;
  let lightActive = false;
  let dragging = false;
  let dragHasMoved = false;
  let releaseActive = false;
  let releaseStarted = 0;
  let formStarted = 0;
  let releaseForm = 1;
  let releaseX = 0;
  let releaseY = 0;
  let dragPointerId = null;
  let previousX = innerWidth * 0.5;
  let previousY = innerHeight * 0.5;
  let previousTime = performance.now();
  let lastPointerX = previousX;
  let lastPointerY = previousY;
  let hasPointer = false;
  let journeyProgress = 0;
  let artworkInteractive = false;
  let lastVideoSeek = 0;
  let raf = 0;
  let animationFrame = 0;
  let lastAnimatedAt = 0;
  let wingTimer = 0;
  let gl = null;
  let program = null;
  let normalTexture = null;
  let silverTexture = null;
  let colorTexture = null;
  let normalReady = false;
  let silverReady = false;
  let colorReady = false;
  let uniforms = {};

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (value, edge0, edge1) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function applyPantheonReveal(amount) {
    if (reduceMotion.matches) {
      pantheonFogShape.setAttribute("y", "0");
      pantheonFogShape.setAttribute("height", "1.4");
      emergenceHaze.style.opacity = "0";
      return;
    }

    const rise = clamp(amount, 0, 1);
    const baseY = (1 - rise) * 100;
    pantheonFogShape.setAttribute("y", (1 - rise).toFixed(4));
    pantheonFogShape.setAttribute("height", rise <= 0.001 ? "0" : (1.4 - (1 - rise)).toFixed(4));
    emergenceHaze.style.setProperty("--reveal-y", `${baseY.toFixed(2)}%`);
    emergenceHaze.style.opacity = (Math.sin(Math.PI * rise) * 0.4).toFixed(3);
  }

  function updateJourney() {
    const travel = Math.max(1, story.offsetHeight - hero.clientHeight);
    const progress = reduceMotion.matches
      ? 1
      : clamp(-story.getBoundingClientRect().top / travel, 0, 1);
    journeyProgress = progress;

    const revealAmount = reduceMotion.matches ? 1 : smoothstep(progress, 0.78, 0.95);
    filmLayer.style.opacity = "1";
    applyPantheonReveal(revealAmount);
    goldenMist.style.opacity = (0.25 + smoothstep(progress, 0.58, 0.88) * 0.09).toFixed(3);

    for (const caption of captions) {
      const enter = smoothstep(progress, caption.inStart, caption.inEnd);
      const exit = smoothstep(progress, caption.outStart, caption.outEnd);
      const leave = 1 - exit;
      const opacity = clamp(enter * leave, 0, 1);
      caption.element.style.opacity = opacity.toFixed(4);
      const offsetY = progress < caption.outStart ? (1 - enter) * 18 : -exit * 12;
      caption.element.style.transform = `translate3d(0, ${offsetY.toFixed(2)}px, 0)`;
      caption.element.style.filter = `blur(${((1 - opacity) * 3.5).toFixed(2)}px)`;
    }

    const canInteract = reduceMotion.matches || revealAmount >= 0.90;
    if (canInteract !== artworkInteractive) {
      artworkInteractive = canInteract;
      art.style.pointerEvents = canInteract ? "auto" : "none";
      art.style.touchAction = canInteract ? "none" : "auto";
      art.tabIndex = canInteract ? 0 : -1;
      if (!canInteract) {
        if (dragging) endDrag();
        document.body.classList.remove("has-custom-cursor");
        cursor.classList.remove("visible", "awake");
        hero.classList.remove("is-moving");
        lightActive = false;
        scheduleRender();
      } else if (hasPointer && finePointer.matches) {
        const rect = art.getBoundingClientRect();
        if (lastPointerX >= rect.left && lastPointerX <= rect.right && lastPointerY >= rect.top && lastPointerY <= rect.bottom) {
          document.body.classList.add("has-custom-cursor");
          cursor.style.setProperty("--cx", lastPointerX + "px");
          cursor.style.setProperty("--cy", lastPointerY + "px");
          cursor.classList.add("visible");
          lightX = lastPointerX - rect.left;
          lightY = lastPointerY - rect.top;
          lightActive = true;
          scheduleRender();
        }
      }
    }

    if (!reduceMotion.matches && cloudFilm.readyState >= 2 && Number.isFinite(cloudFilm.duration)) {
      const filmProgress = clamp(progress / 0.78, 0, 1);
      const targetTime = filmProgress * cloudFilm.duration;
      const difference = Math.abs(targetTime - cloudFilm.currentTime);
      const seekDelay = cloudFilm.seeking ? 180 : 38;
      const seekThreshold = cloudFilm.seeking ? 0.58 : 0.025;
      if (difference > seekThreshold && performance.now() - lastVideoSeek > seekDelay) {
        cloudFilm.currentTime = targetTime;
        lastVideoSeek = performance.now();
      }
    }

    scheduleRender();
  }

  const lenis = !reduceMotion.matches && typeof window.Lenis === "function"
    ? new window.Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: false, wheelMultiplier: 0.9 })
    : null;
  if (lenis) {
    lenis.on("scroll", updateJourney);
    const smoothScrollFrame = time => {
      lenis.raf(time);
      requestAnimationFrame(smoothScrollFrame);
    };
    requestAnimationFrame(smoothScrollFrame);
  }

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      console.warn("Golden Snitch shader did not compile:", gl.getShaderInfoLog(result));
      gl.deleteShader(result);
      return null;
    }
    return result;
  }

  const fragmentSource = `
    precision mediump float;
    uniform sampler2D u_normals;
    uniform sampler2D u_silver;
    uniform sampler2D u_color;
    uniform vec2 u_resolution;
    uniform vec2 u_light;
    uniform vec2 u_revealCenter;
    uniform vec4 u_imageRect;
    uniform float u_radius;
    uniform float u_revealRadius;
    uniform float u_time;
    uniform float u_reveal;
    uniform float u_form;
    uniform float u_release;
    uniform float u_releaseProgress;
    uniform float u_lightOn;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += vec2(dot(p, p + vec2(45.32)));
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int octave = 0; octave < 3; octave++) {
        value += noise(p) * amplitude;
        p = p * 2.03 + vec2(17.1, 9.2);
        amplitude *= 0.5;
      }
      return value / 0.875;
    }
    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 uv = (p - u_imageRect.xy) / u_imageRect.zw;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec4 relief = texture2D(u_normals, uv);
      float surface = smoothstep(0.035, 0.44, relief.a);
      if (surface < 0.012) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec3 n = normalize(relief.rgb * 2.0 - 1.0);
      vec2 delta = (u_light - p) / u_radius;
      float distanceFromLight = length(delta);
      vec3 l = normalize(vec3(delta * 1.35, 1.0));
      vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
      float facing = max(dot(n, l), 0.0);
      float phong = pow(max(dot(n, h), 0.0), 58.0);
      float broad = pow(max(dot(n, h), 0.0), 11.0);
      float falloff = exp(-distanceFromLight * distanceFromLight * 2.35);
      float lightAlpha = u_lightOn * surface * falloff * clamp(phong * 0.75 + broad * 0.072 + facing * 0.022, 0.0, 0.8);
      vec3 warmLight = vec3(1.0, 0.83, 0.52);
      float silverField = exp(-distanceFromLight * distanceFromLight * 0.72);
      float silverAlpha = u_lightOn * surface * silverField * 0.54;

      float reveal = 0.0;
      float edge = 0.0;
      float pigment = 0.0;
      float fade = 1.0;
      float refraction = 0.0;
      if (u_reveal > 0.5) {
        float formation = smoothstep(0.0, 1.0, u_form);
        float fieldScale = mix(0.46, 1.0, formation);
        vec2 local = (p - u_revealCenter) / (u_revealRadius * fieldScale);
        vec2 drift = vec2(u_time * 0.045, -u_time * 0.032);
        float current = fbm(local * 1.75 + drift * 0.65);
        float curl = fbm(local * 2.7 + vec2(6.3, 11.7) - drift * 1.1);
        vec2 warped = local + (vec2(current, curl) - vec2(0.5)) * 0.28;
        float cloud = fbm(warped * 2.8 + vec2(-u_time * 0.025, u_time * 0.035));
        float marbling = fbm(warped * 5.6 + vec2(8.2, -u_time * 0.055));
        float strata = fbm(warped * 11.0 + vec2(-u_time * 0.07, 4.1));
        float fineGrain = noise(warped * 25.0 + vec2(u_time * 0.06, -u_time * 0.04));
        float distanceFromField = length(local);
        float fogFalloff = exp(-distanceFromField * distanceFromField * 1.08);
        float density = clamp(0.84 + (cloud - 0.5) * 0.40 + (marbling - 0.5) * 0.22 + (strata - 0.5) * 0.09 + (fineGrain - 0.5) * 0.04, 0.68, 1.0);
        reveal = fogFalloff * density * surface * formation;
        edge = 0.0;
        float veins = exp(-abs(marbling - 0.52) * 19.0) * fogFalloff;
        float striation = pow(max(1.0 - abs(strata * 2.0 - 1.0), 0.0), 3.0) * fogFalloff;
        float flecks = smoothstep(0.77, 0.94, fineGrain) * fogFalloff;
        pigment = veins * 0.11 + striation * 0.075 + flecks * 0.12;
        refraction = (current - curl) * fogFalloff * 0.0024 + (fineGrain - 0.5) * veins * 0.0005;
        if (u_release > 0.5) {
          float releaseNoise = noise(warped * 5.5 + vec2(u_time * 0.025, -u_time * 0.04));
          float farthest = clamp(distanceFromField / 1.8 + (releaseNoise - 0.5) * 0.065, 0.0, 1.0);
          float fadeStart = 1.0 - farthest;
          fade = 1.0 - smoothstep(fadeStart, fadeStart + 0.20, u_releaseProgress);
        }
      }

      vec3 silverSource = texture2D(u_silver, uv).rgb;
      vec3 silverMetal = mix(vec3(0.70, 0.69, 0.65), silverSource, 0.9) + warmLight * phong * falloff * 0.22;
      vec4 source = texture2D(u_color, uv + vec2(refraction, -refraction));
      vec3 mineralColor = source.rgb * (0.91 + facing * 0.12) + warmLight * phong * falloff * 0.40;
      float colorAlpha = reveal * fade * 0.96;
      float rimAlpha = clamp(pigment * fade, 0.0, 0.16);
      vec3 rimColor = mix(vec3(0.58, 0.78, 0.70), vec3(0.88, 0.68, 0.39), noise(p * 0.011 + vec2(u_time * 0.09, -u_time * 0.07)));
      rimColor = mix(rimColor, vec3(1.0, 0.94, 0.76), pigment * 0.68);

      vec3 rgb = silverMetal * silverAlpha;
      float alpha = silverAlpha;
      rgb = mineralColor * colorAlpha + rgb * (1.0 - colorAlpha);
      alpha = colorAlpha + alpha * (1.0 - colorAlpha);
      rgb = rimColor * rimAlpha + rgb * (1.0 - rimAlpha);
      alpha = rimAlpha + alpha * (1.0 - rimAlpha);
      rgb = warmLight * lightAlpha + rgb * (1.0 - lightAlpha);
      alpha = lightAlpha + alpha * (1.0 - lightAlpha);
      gl_FragColor = vec4(rgb, alpha);
    }
  `;

  function createTexture(unit) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  function uploadImage(texture, image, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  function initWebGL() {
    gl = lightCanvas.getContext("webgl", {
      alpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: "low-power", premultipliedAlpha: true
    });
    if (!gl) {
      art.classList.add("lighting-fallback");
      return;
    }
    const vertex = shader(gl.VERTEX_SHADER,
      "attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.0,1.0);}");
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) {
      art.classList.add("lighting-fallback");
      return;
    }
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Golden Snitch shader did not link:", gl.getProgramInfoLog(program));
      art.classList.add("lighting-fallback");
      program = null;
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    normalTexture = createTexture(0);
    colorTexture = createTexture(1);
    silverTexture = createTexture(2);
    uniforms = {
      normals: gl.getUniformLocation(program, "u_normals"),
      silver: gl.getUniformLocation(program, "u_silver"),
      color: gl.getUniformLocation(program, "u_color"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      light: gl.getUniformLocation(program, "u_light"),
      revealCenter: gl.getUniformLocation(program, "u_revealCenter"),
      imageRect: gl.getUniformLocation(program, "u_imageRect"),
      radius: gl.getUniformLocation(program, "u_radius"),
      revealRadius: gl.getUniformLocation(program, "u_revealRadius"),
      time: gl.getUniformLocation(program, "u_time"),
      reveal: gl.getUniformLocation(program, "u_reveal"),
      form: gl.getUniformLocation(program, "u_form"),
      release: gl.getUniformLocation(program, "u_release"),
      releaseProgress: gl.getUniformLocation(program, "u_releaseProgress"),
      lightOn: gl.getUniformLocation(program, "u_lightOn")
    };
    gl.uniform1i(uniforms.normals, 0);
    gl.uniform1i(uniforms.color, 1);
    gl.uniform1i(uniforms.silver, 2);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    normalImage.decoding = "async";
    colorImage.decoding = "async";
    normalImage.addEventListener("load", () => {
      uploadImage(normalTexture, normalImage, 0);
      normalReady = true;
      resize();
      scheduleRender();
    }, { once: true });
    silverImage.addEventListener("load", () => {
      uploadImage(silverTexture, silverImage, 2);
      silverReady = true;
      resize();
      scheduleRender();
    }, { once: true });
    colorImage.addEventListener("load", () => {
      uploadImage(colorTexture, colorImage, 1);
      colorReady = true;
      scheduleRender();
    }, { once: true });
    normalImage.src = "assets/sculpture-normals.webp";
    silverImage.src = "assets/silver-gods.webp";
    colorImage.src = "assets/chromatic-gods.webp";
  }

  function resize() {
    const rect = art.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 1);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (lightCanvas.width !== pixelWidth || lightCanvas.height !== pixelHeight) {
      lightCanvas.width = pixelWidth;
      lightCanvas.height = pixelHeight;
    }
    lightCanvas.style.width = width + "px";
    lightCanvas.style.height = height + "px";

    if (gl && program) {
      gl.viewport(0, 0, lightCanvas.width, lightCanvas.height);
      gl.useProgram(program);
      const sourceWidth = normalImage.naturalWidth || 2;
      const sourceHeight = normalImage.naturalHeight || 1;
      const objectFit = getComputedStyle(art.querySelector(".art-porcelain")).objectFit;
      const scale = objectFit === "cover"
        ? Math.max(width / sourceWidth, height / sourceHeight)
        : Math.min(width / sourceWidth, height / sourceHeight);
      const imageWidth = sourceWidth * scale;
      const imageHeight = sourceHeight * scale;
      const left = (width - imageWidth) * 0.5;
      const top = height - imageHeight;
      gl.uniform4f(uniforms.imageRect, left * ratio, (height - top - imageHeight) * ratio,
        imageWidth * ratio, imageHeight * ratio);
      gl.uniform2f(uniforms.resolution, lightCanvas.width, lightCanvas.height);
    }
    scheduleRender();
  }

  function render(now = performance.now()) {
    if (!gl || !program) return;
    gl.viewport(0, 0, lightCanvas.width, lightCanvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!normalReady || !silverReady || !colorReady) return;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, silverTexture);
    gl.uniform2f(uniforms.light, lightX * ratio, (height - lightY) * ratio);
    const radius = Math.max(130, Math.min(width * 0.24, 260)) * ratio;
    gl.uniform1f(uniforms.radius, radius);
    gl.uniform1f(uniforms.revealRadius, radius * 1.02);
    const revealCenterX = dragging ? lightX : releaseX;
    const revealCenterY = dragging ? lightY : releaseY;
    gl.uniform2f(uniforms.revealCenter, revealCenterX * ratio, (height - revealCenterY) * ratio);
    gl.uniform1f(uniforms.time, now * 0.001);
    const revealNow = (dragging && dragHasMoved) || releaseActive;
    gl.uniform1f(uniforms.reveal, revealNow ? 1 : 0);
    const formProgress = dragging && dragHasMoved
      ? Math.min(1, (now - formStarted) / 420)
      : releaseActive ? releaseForm : 0;
    gl.uniform1f(uniforms.form, formProgress);
    gl.uniform1f(uniforms.release, releaseActive ? 1 : 0);
    gl.uniform1f(uniforms.releaseProgress, releaseActive ? (now - releaseStarted) / 2400 : 0);
    gl.uniform1f(uniforms.lightOn, lightActive ? 1 : 0);
    if (lightActive || revealNow) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function scheduleRender() {
    if (!raf) raf = requestAnimationFrame(now => {
      raf = 0;
      render(now);
    });
  }

  function ensureRevealAnimation() {
    if (!reduceMotion.matches && !animationFrame) animationFrame = requestAnimationFrame(animateReveal);
  }

  function animateReveal(now) {
    animationFrame = 0;
    if (!(dragging && dragHasMoved) && !releaseActive) return;
    if (releaseActive && now - releaseStarted >= 2400 * 1.2) {
      releaseActive = false;
      scheduleRender();
      return;
    }
    if (now - lastAnimatedAt >= 32) {
      lastAnimatedAt = now;
      render(now);
    }
    animationFrame = requestAnimationFrame(animateReveal);
  }

  function jiggle() {
    cursor.classList.remove("jiggle");
    void cursor.offsetWidth;
    cursor.classList.add("jiggle");
    window.setTimeout(() => cursor.classList.remove("jiggle"), 620);
  }

  function startDrag(event) {
    if (!artworkInteractive) return;
    if (event.button !== 0 && event.button !== 2) return;
    if (event.button === 2) event.preventDefault();
    dragging = true;
    dragHasMoved = false;
    releaseActive = false;
    dragPointerId = event.pointerId;
    jiggle();
    try { hero.setPointerCapture(event.pointerId); } catch (_) {}
    scheduleRender();
  }

  function endDrag(event) {
    if (!dragging || (event && event.pointerId !== undefined && event.pointerId !== dragPointerId)) return;
    const hadReveal = dragHasMoved;
    const endedAt = performance.now();
    releaseX = lightX;
    releaseY = lightY;
    dragging = false;
    dragHasMoved = false;
    dragPointerId = null;
    releaseActive = hadReveal && !reduceMotion.matches;
    if (releaseActive) {
      releaseForm = Math.min(1, (endedAt - formStarted) / 420);
      releaseStarted = endedAt;
      lastAnimatedAt = 0;
      ensureRevealAnimation();
    }
    scheduleRender();
  }

  function handleHeroKeyDown(event) {
    if (!artworkInteractive) return;
    if (event.key === " " || event.key === "Spacebar") {
      if (event.repeat) return;
      event.preventDefault();
      if (!dragging) {
        dragging = true;
        dragHasMoved = false;
        dragPointerId = null;
        releaseActive = false;
        formStarted = performance.now();
        jiggle();
        scheduleRender();
      }
      return;
    }

    const directions = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    if (!lightActive) {
      lightX = width * 0.5;
      lightY = height * 0.5;
    }
    const step = event.shiftKey ? 56 : 28;
    lightX = Math.max(0, Math.min(width, lightX + direction[0] * step));
    lightY = Math.max(0, Math.min(height, lightY + direction[1] * step));
    art.style.setProperty("--mx", (lightX / width * 100) + "%");
    art.style.setProperty("--my", (lightY / height * 100) + "%");
    lightActive = true;
    hero.classList.add("is-moving");
    if (dragging && dragPointerId === null) {
      if (!dragHasMoved) formStarted = performance.now();
      dragHasMoved = true;
      ensureRevealAnimation();
    }
    scheduleRender();
  }

  function handleHeroKeyUp(event) {
    if ((event.key === " " || event.key === "Spacebar") && dragging && dragPointerId === null) {
      endDrag(event);
    }
  }

  function updateWings(speed) {
    if (!finePointer.matches || speed <= 0.025) return;
    cursor.style.setProperty("--flap-period", Math.max(145, Math.min(245, 245 - speed * 5.8)) + "ms");
    cursor.classList.add("awake");
    clearTimeout(wingTimer);
    wingTimer = setTimeout(() => {
      if (!dragging) cursor.classList.remove("awake");
    }, 340);
  }

  function updatePointer(event) {
    const now = performance.now();
    const dt = Math.max(8, now - previousTime);
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    const speed = Math.hypot(dx, dy) / dt;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    hasPointer = true;
    previousX = event.clientX;
    previousY = event.clientY;
    previousTime = now;

    if (!artworkInteractive) {
      if (!dragging) {
        document.body.classList.remove("has-custom-cursor");
        cursor.classList.remove("visible", "awake");
        lightActive = false;
      }
      return;
    }

    if (finePointer.matches) {
      document.body.classList.add("has-custom-cursor");
      cursor.style.setProperty("--cx", event.clientX + "px");
      cursor.style.setProperty("--cy", event.clientY + "px");
      cursor.classList.add("visible");
      cursor.style.setProperty("--light-x", Math.max(-8, Math.min(8, dx * 0.12)) + "px");
      cursor.style.setProperty("--light-y", Math.max(-7, Math.min(7, dy * 0.12)) + "px");
    }
    updateWings(speed);

    const rect = art.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (inside) {
      hero.classList.add("is-moving");
      art.style.setProperty("--mx", ((event.clientX - rect.left) / rect.width * 100) + "%");
      art.style.setProperty("--my", ((event.clientY - rect.top) / rect.height * 100) + "%");
      lightX = event.clientX - rect.left;
      lightY = event.clientY - rect.top;
      lightActive = true;
      if (dragging && event.pointerId === dragPointerId && Math.hypot(dx, dy) > 2.5) {
        if (!dragHasMoved) formStarted = now;
        dragHasMoved = true;
        ensureRevealAnimation();
      }
    } else {
      lightActive = false;
      if (!dragging) hero.classList.remove("is-moving");
    }
    scheduleRender();
  }

  art.addEventListener("pointerdown", startDrag);
  hero.addEventListener("pointerup", endDrag);
  hero.addEventListener("pointercancel", endDrag);
  hero.addEventListener("lostpointercapture", endDrag);
  art.addEventListener("keydown", handleHeroKeyDown);
  art.addEventListener("keyup", handleHeroKeyUp);
  hero.addEventListener("contextmenu", event => event.preventDefault());
  document.addEventListener("pointermove", updatePointer, { passive: true });
  document.addEventListener("pointerleave", () => {
    if (!dragging) {
      hasPointer = false;
      document.body.classList.remove("has-custom-cursor");
      cursor.classList.remove("visible", "awake");
      hero.classList.remove("is-moving");
      lightActive = false;
      scheduleRender();
    }
  });
  window.addEventListener("blur", () => endDrag());
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", updateJourney, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(art);

  initWebGL();
  resize();
  updateJourney();
})();
