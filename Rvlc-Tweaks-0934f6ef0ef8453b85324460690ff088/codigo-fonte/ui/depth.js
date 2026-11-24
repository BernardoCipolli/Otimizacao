"use strict";

window.depthRenderer = function (canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;

  const vertexShader = `
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec3 color;
    attribute float emissive;
    uniform vec4 angles;
    uniform vec2 zoom;
    uniform vec2 offset;
    uniform vec4 partTurn;
    uniform mediump vec4 partShift;
    varying vec3 tint;
    varying vec3 viewNormal;
    varying vec3 viewPosition;
    varying float lightStrip;

    vec3 orbit(vec3 p) {
      vec2 plane = mat2(angles.x, -angles.y, angles.y, angles.x) * p.xz;
      vec2 view = mat2(angles.z, angles.w, -angles.w, angles.z) * vec2(p.y, plane.y);
      return vec3(plane.x, view);
    }

    vec3 spin(vec3 v) {
      vec2 plane = mat2(partTurn.x, partTurn.y, -partTurn.y, partTurn.x) * v.xz;
      return vec3(plane.x, v.y, plane.y);
    }

    void main() {
      vec3 pivot = vec3(partTurn.z, 0.0, partTurn.w);
      vec3 point = orbit(spin(position - pivot) + pivot + partShift.xyz);
      tint = color;
      viewNormal = orbit(spin(normal));
      viewPosition = point;
      lightStrip = emissive;
      float perspective = 1.0 - point.z / 8.0;
      gl_Position = vec4(point.xy * zoom + offset * perspective, -point.z * 0.15, perspective);
    }`;
  const fragmentShader = `
    precision mediump float;
    varying vec3 tint;
    varying vec3 viewNormal;
    varying vec3 viewPosition;
    varying float lightStrip;
    uniform mediump vec4 partShift;

    void main() {
      vec3 unitNormal = normalize(viewNormal);
      vec3 view = normalize(vec3(0.0, 0.0, 8.0) - viewPosition);
      vec3 key = normalize(vec3(-0.46, 0.69, 0.68));
      vec3 side = normalize(vec3(0.77, -0.05, 0.38));
      float diffuse = max(0.0, dot(unitNormal, key));
      float fill = max(0.0, dot(unitNormal, side));
      float gloss = pow(max(0.0, dot(normalize(key + view), unitNormal)), 28.0);
      float rim = pow(1.0 - max(0.0, dot(unitNormal, view)), 4.0);
      vec3 shaded = tint * (0.44 + 0.66 * diffuse + 0.22 * fill)
        + vec3(0.74, 0.65, 0.51) * gloss * 0.22 + vec3(0.32, 0.42, 0.44) * rim * 0.20;
      gl_FragColor = vec4(clamp(mix(shaded, tint * 1.14 * partShift.w, lightStrip), 0.0, 1.0), 1.0);
    }`;

  let program, buffer, ranges = [];
  let uniforms;
  const meshes = new WeakMap();

  function initialize() {
    const shader = (kind, source) => {
      const s = gl.createShader(kind);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s));
      }
      return s;
    };
    program = gl.createProgram();
    const vertex = shader(gl.VERTEX_SHADER, vertexShader);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [["position", 3, 0], ["normal", 3, 3], ["color", 3, 6], ["emissive", 1, 9]]) {
      const index = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 40, offset * 4);
    }
    uniforms = Object.fromEntries(["angles", "zoom", "offset", "partTurn", "partShift"].map((name) => [name, gl.getUniformLocation(program, name)]));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
  }

  function normalOf(points) {
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i].map((v, axis) => v - points[0][axis]);
      const b = points[i + 1].map((v, axis) => v - points[0][axis]);
      const v = [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
      ];
      const magnitude = Math.hypot(...v);
      if (magnitude > 0.000001) return v.map((n) => n / magnitude);
    }
    return null;
  }

  function triangles(points, normal) {
    const area = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const abs = normal.map(Math.abs);
    const axis = abs.indexOf(Math.max(...abs));
    const projected = points.map((point) => point.filter((_, i) => i !== axis));
    const winding = Math.sign(projected.reduce((sum, p, i) => {
      const q = projected[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0));

    const output = [];
    const left = points.map((_, index) => index);
    while (left.length > 3) {
      let removed = false;
      for (let i = 0; i < left.length; i++) {
        const a = left[(i + left.length - 1) % left.length], b = left[i], c = left[(i + 1) % left.length];
        const p = projected[a], q = projected[b], r = projected[c];
        if (area(p, q, r) * winding <= 0.000001) continue;
        const covers = left.some((index) => {
          if (index === a || index === b || index === c) return false;
          const point = projected[index];
          return [area(p, q, point), area(q, r, point), area(r, p, point)].every((value) => value * winding >= 0);
        });
        if (covers) continue;
        output.push(points[a], points[b], points[c]);
        left.splice(i, 1);
        removed = true;
        break;
      }
      if (!removed) break;
    }
    for (let i = 1; i < left.length - 1; i++) {
      output.push(points[left[0]], points[left[i]], points[left[i + 1]]);
    }
    return output;
  }

  function setGeometry(faces) {
    if (gl.isContextLost()) return;
    if (!meshes.has(faces)) {
      const batches = new Map();
      for (const face of faces) {
        const normal = normalOf(face.vertices);
        if (!normal) continue;
        if (!batches.has(face.motion)) batches.set(face.motion, []);
        const vertices = batches.get(face.motion);
        const color = [1, 3, 5].map((i) => parseInt(face.color.slice(i, i + 2), 16) / 255);
        for (const point of triangles(face.vertices, normal)) {
          const vertexNormal = face.normals?.[face.vertices.indexOf(point)] ?? normal;
          vertices.push(...point, ...vertexNormal, ...color, face.bright ? 1 : 0);
        }
      }
      const vertices = new Float32Array([...batches.values()].reduce((size, batch) => size + batch.length, 0));
      const draws = [];
      let start = 0;
      for (const [motion, batch] of batches) {
        vertices.set(batch, start);
        draws.push({ motion, first: start / 10, count: batch.length / 10 });
        start += batch.length;
      }
      meshes.set(faces, { vertices, draws });
    }
    const mesh = meshes.get(faces);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    ranges = mesh.draws;
  }

  function render(camera, zoom, offset, time) {
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform4f(uniforms.angles, Math.cos(camera.yaw), Math.sin(camera.yaw), Math.cos(camera.pitch), Math.sin(camera.pitch));
    gl.uniform2fv(uniforms.zoom, zoom);
    gl.uniform2fv(uniforms.offset, offset);
    for (const { motion, first, count } of ranges) {
      const { angle = 0, pivotX = 0, x = 0, y = 0, light = 1 } = motion?.(time) ?? {};
      gl.uniform4f(uniforms.partTurn, Math.cos(angle), Math.sin(angle), pivotX, 0);
      gl.uniform4f(uniforms.partShift, x, y, 0, light);
      gl.drawArrays(gl.TRIANGLES, first, count);
    }
  }

  try {
    initialize();
  } catch (error) {
    console.warn(error);
    return { setGeometry() {}, render() {} };
  }
  canvas.addEventListener("webglcontextlost", (event) => event.preventDefault());
  canvas.addEventListener("webglcontextrestored", initialize);
  return { setGeometry, render };
};
