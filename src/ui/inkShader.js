const VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const FRAGMENT = `
  uniform float u_time;
  uniform vec2 u_resolution;
  varying vec2 vUv;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 st) {
    float value = 0.0, amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(st);
      st *= 2.0; amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;
    float time = u_time * 0.025;

    vec2 q = vec2(fbm(st + vec2(time)), fbm(st + vec2(1.0)));
    vec2 r = vec2(
      fbm(st + q + vec2(1.7, 9.2) + 0.15 * time),
      fbm(st + q + vec2(8.3, 2.8) + 0.126 * time)
    );
    float f = fbm(st + r);

    vec3 paper = vec3(0.961, 0.949, 0.922);
    vec3 ink = vec3(0.067, 0.067, 0.063);
    float mask = smoothstep(0.15, 0.55, f * length(q));
    vec3 color = mix(paper, ink, mask);

    float grain = fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
    color -= grain * 0.025;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function initInkBackground() {
  const container = document.getElementById('ink-bg');
  if (!container || typeof THREE === 'undefined') return null;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });

  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);

  const uniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
  };

  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  const clock = new THREE.Clock();
  let running = true;

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    uniforms.u_time.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    uniforms.u_resolution.value.set(w, h);
  });

  return { stop: () => { running = false; } };
}
