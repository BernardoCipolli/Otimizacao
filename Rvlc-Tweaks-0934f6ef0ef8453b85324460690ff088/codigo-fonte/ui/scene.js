"use strict";

window.makeScene = function (canvas) {
  const depth = window.depthRenderer(canvas);
  const ctx = depth ? null : canvas.getContext("2d");
  const stage = canvas.parentElement;
  const dividers = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  const palette = {
    graphite: "#2c3433", board: "#314444", alloy: "#5b706d", core: "#56564d",
    line: "#a19b82", pin: "#c9b593", light: "#ffdabc", ink: "#151f21",
    violet: "#9674ef", mint: "#86e9c5", darkMint: "#276b65", black: "#192841"
  };
  const defaults = {
    chip: { yaw: -.47, pitch: .65, zoom: 1.11, center: .40, accent: "#ffd3a4" },
    ram: { yaw: -.34, pitch: .65, zoom: 1.18, center: .42, accent: "#cfe6a1" },
    drive: { yaw: -.58, pitch: .63, zoom: 1.17, center: .43, accent: "#cee9b9" },
    vault: { yaw: -.49, pitch: .51, zoom: 1.16, center: .46, accent: "#78edc1" },
    gpu: { yaw: -.24, pitch: .82, zoom: 1.10, center: .44, accent: "#9ef5ae" },
    mouse: { yaw: .62, pitch: .74, zoom: 1.30, center: .43, accent: "#f4a779" },
    display: { yaw: -.29, pitch: .18, zoom: 1.07, center: .47, accent: "#8fe5d7" },
    command: { yaw: -.42, pitch: .21, zoom: 1.14, center: .48, accent: "#a0e9bb" },
    terminal: { yaw: -.35, pitch: .15, zoom: 1.14, center: .48, accent: "#9abbff" },
    battery: { yaw: -.48, pitch: .65, zoom: 1.14, center: .37, accent: "#ffe2a0" }
  };
  const models = new Map();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let geometry = [];
  let animated = false;
  let mode = "";
  let camera = defaults.chip;
  let frame = 0;
  let animationTimer = 0, startedAt = 0;
  let inView = true;
  let drag = null;

  function face(vertices, color, bright = false, normals) {
    geometry.push({ vertices, color, bright, normals });
  }

  function movingPart(motion, build) {
    const start = geometry.length;
    build();
    for (let i = start; i < geometry.length; i++) geometry[i].motion = motion;
  }

  function pulse(rate, phase = 0) {
    return (time) => ({ light: .64 + .34 * Math.cos(rate * time + phase) });
  }

  function surface(points, y, color, bright = false) {
    const area = points.reduce((sum, [x, z], i) => {
      const [nextX, nextZ] = points[(i + 1) % points.length];
      return sum + x * nextZ - nextX * z;
    }, 0);
    const vertices = points.map(([x, z]) => [x, y, z]);
    face(area > 0 ? vertices.reverse() : vertices, color, bright);
  }

  function bevelRect(x, z, w, d, cut) {
    const l = x - w / 2, r = x + w / 2, n = z - d / 2, s = z + d / 2;
    return [[l + cut, n], [r - cut, n], [r, n + cut], [r, s - cut],
      [r - cut, s], [l + cut, s], [l, s - cut], [l, n + cut]];
  }

  function extrude(points, bottom, top, color, topColor = color) {
    const low = points.map(([x, z]) => [x, bottom, z]);
    const high = points.map(([x, z]) => [x, top, z]);
    face([...high].reverse(), topColor);
    face(low, color);
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      face([low[i], high[i], high[j], low[j]], color);
    }
  }

  function slab(x, y, z, w, h, d, color, top = color, bevel = 0.04) {
    extrude(bevelRect(x, z, w, d, Math.min(bevel, w / 2, d / 2)), y - h / 2, y + h / 2, color, top);
  }

  function circle(x, z, radius, count) {
    return Array.from({ length: count }, (_, i) => {
      const angle = i * Math.PI * 2 / count;
      return [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius];
    });
  }

  function knob(x, y, z, radius, height, color, top = color) {
    extrude(circle(x, z, radius, 18), y, y + height, color, top);
  }

  function trace(x1, z1, x2, z2, y, width, color) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len === 0) return;
    const dx = (z2 - z1) * width / len;
    const dz = (x1 - x2) * width / len;
    surface([[x1 + dx, z1 + dz], [x1 - dx, z1 - dz],
      [x2 - dx, z2 - dz], [x2 + dx, z2 + dz]], y, color, true);
  }

  function ring(x, y, z, inner, outer, color, pieces = 36, spacing = 0) {
    const step = Math.PI * 2 / pieces;
    const point = (r, a) => [x + Math.cos(a) * r, z + Math.sin(a) * r];
    for (let i = 0; i < pieces; i++) {
      const from = i * step, to = from + step - spacing;
      surface([point(inner, from), point(outer, from), point(outer, to), point(inner, to)], y, color, true);
    }
  }

  function chip() {
    slab(0, -0.54, 0, 3.71, 0.16, 3.31, palette.graphite, palette.board, .18);
    slab(0, -0.64, 0, 3.68, 0.07, 3.27, "#33453f", "#9aba9a", .18);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const x = -1.25 + i * .277;
        slab(x, -.438, side * 1.57, .16, .054, .084, "#394b46", "#6e8076", .013);
        slab(x - .066, -.413, side * 1.57, .027, .009, .085, "#9e8c73", "#bfa380", .008);
      }
      for (let i = 0; i < 6; i++) {
        const z = -.75 + i * .30;
        slab(side * 1.65, -.419, z, .13, .094, .115, "#465e63", "#718487", .018);
      }
    }
    for (const angle of dividers) {
      const rotate = (x, z) => [x * Math.cos(angle) - z * Math.sin(angle),
        x * Math.sin(angle) + z * Math.cos(angle)];
      for (let index = -3; index <= 3; index++) {
        const x = index * .23;
        const shoulder = Math.sign(index) * (0.05 + Math.abs(index) * .055);
        const a = rotate(x, 0.99);
        const b = rotate(x, 1.17);
        const c = rotate(x + shoulder, 1.32);
        const d = rotate(x + shoulder, 1.47);
        trace(...a, ...b, -.45, .013, "#caa884");
        trace(...b, ...c, -.45, .013, "#caa884");
        trace(...c, ...d, -.45, .013, "#caa884");
        const glow = index % 3 === 0 ? palette.light : "#848d79";
        knob(d[0], -.449, d[1], .041, .02, "#667c6f", glow);
      }
    }
    for (const x of [-1.53, 1.53]) {
      for (const z of [-1.40, 1.40]) {
        knob(x, -.46, z, .1, .045, "#5d766a", "#b3c7a8");
        knob(x, -.414, z, .049, .006, palette.ink);
      }
    }
    slab(0, -.39, 0, 2.02, .21, 2.02, "#333a3d", "#727977", .13);
    for (let i = -5; i <= 5; i++) {
      const along = i * .154;
      slab(along, -.33, 1.04, .059, .065, .26, "#90867a", palette.pin, .006);
      slab(along, -.33, -1.04, .059, .065, .26, "#90867a", palette.pin, .006);
      slab(1.04, -.33, along, .26, .065, .059, "#90867a", palette.pin, .006);
      slab(-1.04, -.33, along, .26, .065, .059, "#90867a", palette.pin, .006);
    }
    slab(0, -.24, 0, 1.91, .11, 1.91, "#5e6462", "#77928a", .12);
    slab(0, -.158, 0, 1.64, .09, 1.64, "#988573", "#d8c1a6", .1);
    slab(0, -.105, 0, 1.54, .035, 1.54, palette.core, "#7b7868", .08);
    for (const x of [-.66, .66]) {
      for (const z of [-.66, .66]) {
        trace(x, z, x * .79, z, -.085, .011, "#c7c1a4");
        trace(x, z, x, z * .79, -.085, .011, "#c7c1a4");
      }
    }
    ring(0, -.084, 0, .534, .559, "#ecbd94", 38, .03);
    movingPart((time) => ({ angle: time * .91 }), () => {
      ring(0, -.083, 0, .375, .414, "#ffc895", 12, .19);
      ring(0, -.082, 0, .237, .268, "#ffe2ba", 6, .22);
    });
    knob(0, -.081, 0, .166, .014, "#bd926a", "#ffce9c");
    movingPart(pulse(2.3), () => surface(circle(0, 0, .116, 22), -.064, "#ffe3bf", true));
  }

  function vault() {
    slab(0, -.75, 0, 3.54, .13, 2.57, "#23485b", "#3a687b", .17);
    slab(0, -.62, 0, 3.07, .15, 2.31, "#305370", "#527a91", .15);
    for (let i = 0; i < 3; i++) {
      const y = -.46 + i * .43;
      slab(0, y, 0, 2.86, .37, 2.10, "#335873", "#428375", .13);
      slab(0, y, 1.059, 2.52, .24, .075, "#293c56", "#3e5a73", .035);
      slab(-.40, y, 1.116, 1.39, .082, .041, "#1c3449", "#2f6d69", .015);
      for (let j = 0; j < 9; j++) {
        slab(-1.01 + j * .145, y, 1.145, .054, .042, .018, "#63928b", "#4d787d", .007);
      }
      movingPart(pulse(2.1, i * 1.5), () => {
        for (const x of [.66, .87, 1.06]) {
          const z = 1.160;
          face([[x - .042, y - .032, z], [x + .042, y - .032, z],
            [x + .042, y + .032, z], [x - .042, y + .032, z]], "#9aedce", true);
          slab(x, y, 1.113, .099, .071, .072, "#4d8c85", "#7ac4ac", .026);
        }
      });
      slab(1.44, y, .19, .035, .076, 1.32, "#326b6e", "#80c5aa", .01);
    }
    slab(0, .67, 0, 2.94, .13, 2.16, "#447e8e", "#6fb5b0", .16);
    slab(0, .752, 0, 2.59, .045, 1.82, "#456e82", "#488f94", .14);
    ring(0, .777, .02, .49, .52, "#a2fce2", 28, .02);
    movingPart((time) => ({ angle: time * 1.06 }), () => ring(0, .782, 0, .59, .623, "#74dabe", 13, .17));
    for (const x of [-1.04, 1.04]) {
      for (const z of [-.73, .73]) {
        knob(x, .769, z, .067, .019, "#77969d", "#a5c1c4");
        trace(x - .025, z, x + .025, z, .790, .007, "#4d6d7a");
      }
    }
    const mark = [[-.25, -.07], [-.05, .13], [.29, -.20]];
    trace(...mark[0], ...mark[1], .785, .049, "#99ffde");
    trace(...mark[1], ...mark[2], .785, .049, "#99ffde");
  }

  function gpu() {
    const graphite = "#222d37", steel = "#536d76", mint = "#92f3ba";

    slab(0, -.34, 0, 4.46, .10, 2.08, "#24333b", "#3a5259", .19);
    slab(0, -.26, 0, 4.28, .065, 1.95, "#1c3833", "#315344", .12);
    for (let i = -21; i <= 21; i++) {
      const x = i * .095;
      slab(x, -.10, .035, .038, .249, 1.94, "#3a5359", "#66818b", .012);
    }
    for (const y of [-.16, -.059]) {
      slab(-.09, y, 1.012, 3.79, .037, .049, "#965f45", "#d89c69", .015);
      slab(-.09, y, -1.027, 3.79, .037, .049, "#965f45", "#d89c69", .015);
    }

    slab(0, .126, 0, 4.48, .162, 2.18, graphite, "#30434a", .22);
    slab(0, .219, 0, 4.37, .041, 2.08, "#566e77", "#3c4e57", .19);
    for (const z of [-.964, .964]) {
      slab(0, .224, z, 3.93, .043, .143, "#263239", "#526771", .07);
      for (const x of [-1.69, -.38, .38, 1.69]) {
        const end = x + Math.sign(x) * .16;
        trace(x, z, end, z - Math.sign(z) * .06, .247, .019, "#90a9aa");
      }
    }
    slab(-.35, .137, 1.104, 2.96, .038, .041, "#457963", "#b2e7a7", .014);
    slab(1.50, .135, 1.097, .32, .052, .037, "#669583", "#94dbb2", .014);
    slab(.79, -.063, -1.002, .61, .179, .34, "#202b33", "#4a5963", .046);
    for (let i = 0; i < 4; i++) {
      slab(.584 + i * .137, -.035, -1.171, .079, .08, .023, "#101923", "#4b5a60", .012);
    }

    for (const [x, direction] of [[-1.025, 1], [1.025, -1]]) {
      extrude(circle(x, 0, .902, 48), .231, .274, "#53666f", "#4d626c");
      extrude(circle(x, 0, .825, 48), .274, .287, "#223039", "#1b282f");
      ring(x, .290, 0, .845, .874, "#7ca0a6", 48);
      ring(x, .294, 0, .824, .843, mint, 48, .012);
      ring(x, .291, 0, .721, .745, "#344c57", 48);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const point = (radius) => [x + Math.cos(angle) * radius, Math.sin(angle) * radius];
        trace(...point(.52), ...point(.769), .289, .009, "#567179");
      }
      movingPart((time) => ({ angle: time * direction * 2.09, pivotX: x }), () => {
        const stations = [
          [.20, -.08, .23, .358], [.38, -.05, .25, .355],
          [.57, .06, .23, .342], [.73, .20, .18, .329], [.785, .32, .095, .326]
        ];
        for (let blade = 0; blade < 9; blade++) {
          const root = blade * 2 * Math.PI / 9;
          const edges = (side) => stations.map(([radius, curve, half, y]) => {
            const angle = root + curve * direction + side * half;
            return [x + Math.cos(angle) * radius, y - side * direction * .023, Math.sin(angle) * radius];
          });
          const left = edges(-1), right = edges(1);
          for (let j = 1; j < left.length; j++) {
            const top = [left[j - 1], right[j - 1], right[j], left[j]];
            const bottom = top.map(([px, py, pz]) => [px, py - .029, pz]);
            face(top, j === 1 ? "#526b77" : "#79939d");
            face([top[0], bottom[0], bottom[3], top[3]], "#3c5560");
            face([top[2], bottom[2], bottom[1], top[1]], "#334b54");
            if (j === left.length - 1) face([top[3], bottom[3], bottom[2], top[2]], "#58757d");
          }
        }
        knob(x, .324, 0, .252, .079, "#5d7580", "#526976");
        ring(x, .406, 0, .165, .190, "#a1bcb7", 32);
        knob(x, .406, 0, .142, .020, "#354d55", "#577683");
        trace(x - .047, .025, x + .048, -.034, .429, .017, "#b6f7d0");
      });
    }

    for (const x of [-1.98, 1.98]) {
      for (const z of [-.80, .80]) {
        knob(x, .241, z, .060, .020, "#74858c", "#97aaaa");
        trace(x - .025, z, x + .025, z, .263, .005, "#34454b");
      }
    }
    for (let i = 0; i < 7; i++) {
      slab(-1.67 + i * .15, -.399, .62, .085, .026, .33, "#202b32", "#516368", .018);
    }
    slab(2.259, -.061, 0, .13, .61, 2.14, "#5f757e", "#9fb2b7", .061);
    for (const z of [-.72, -.31, .10, .51]) {
      slab(2.330, -.036, z, .020, .183, .319, "#1b262d", "#687e86", .028);
      slab(2.342, -.036, z, .012, .108, .240, "#131e26", "#303f47", .013);
    }
    slab(-.51, -.406, -1.083, 1.72, .09, .34, "#716047", "#9f9155", .033);
    for (let i = 0; i < 25; i++) {
      slab(-1.28 + i * .062, -.356, -1.160, .032, .017, .155, "#bda665", "#e7cc86", .004);
    }
  }

  function standingPanel(x, y, z, w, h, thick, bevel, edge, front) {
    const points = bevelRect(x, y, w, h, bevel);
    const backFace = points.map(([px, py]) => [px, py, z - thick / 2]);
    const frontFace = points.map(([px, py]) => [px, py, z + thick / 2]);
    face(frontFace, front);
    face([...backFace].reverse(), edge);
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      face([backFace[i], backFace[j], frontFace[j], frontFace[i]], edge);
    }
  }

  function terminal(command = false) {
    const start = geometry.length;
    slab(0, -1.11, .1, 2.75, .14, 1.34, "#203951", "#466987", .19);
    slab(0, -1.022, .13, 2.46, .04, 1.09, "#597381", "#4b6477", .17);
    slab(0, -.91, -.19, .62, .30, .30, "#27445f", "#416784", .035);
    standingPanel(0, .19, -.035, 3.93, 2.13, .34, .17, "#27435c", "#5380a1");
    for (let i = 0; i < 12; i++) {
      standingPanel(-.57 + i * .104, .77, -.207, .035, .137, .013, .011, "#20323c", "#314450");
    }
    standingPanel(0, .19, .161, 3.70, 1.93, .072, .13, "#547695", "#243c59");
    standingPanel(0, .204, .212, 3.48, 1.71, .032, .095, "#182f4c", "#1d3352");
    standingPanel(0, .844, .238, 3.43, .24, .026, .055, "#294b68", "#426d91");
    for (const [i, color] of ["#fe9bab", "#f1d288", "#8eeacc"].entries()) {
      standingPanel(-1.44 + i * .145, .844, .259, .077, .077, .018, .022, color, color);
    }
    standingPanel(-.29, .844, .259, .64, .035, .013, .01, "#7c9bb4", "#a2bbd0");
    const prompt = [[-.91, .37], [-.61, .15], [-.91, -.07]];
    for (let i = 0; i < 2; i++) {
      const [a, b] = [prompt[i], prompt[i + 1]];
      face([[a[0], a[1] - .052, .261], [b[0], b[1] - .052, .261],
            [b[0], b[1] + .052, .261], [a[0], a[1] + .052, .261]], "#92e2ff", true);
      face([[a[0], a[1] + .052, .262], [b[0], b[1] + .052, .262],
            [b[0], b[1] - .052, .262], [a[0], a[1] - .052, .262]], "#92e2ff", true);
    }
    movingPart(pulse(3.0), () => {
      const cursor = [[-.46, -.107, .274], [-.06, -.107, .274], [-.06, -.032, .274], [-.46, -.032, .274]];
      face(cursor, command ? "#a6f2c1" : "#98eaff", true);
      geometry.at(-1).overlay = .274;
    });
    for (const [y, length, shade] of [[.26, .87, "#78a5d2"], [.10, .65, "#6190bc"], [-.055, 1.2, "#487eaf"], [-.21, .93, "#6190bc"]]) {
      standingPanel(.19 + length / 2, y, .247, length, .046, .015, .01, shade, shade);
      standingPanel(1.54, y, .251, .09, .037, .011, .006, "#63828f", "#63828f");
    }
    standingPanel(0, -.672, .241, .43, .028, .014, .008, "#6a92b2", "#b2d4e6");
    const statusZ = .270;
    movingPart(pulse(1.9, 1.5), () => {
      face([[1.36, -.612, statusZ], [1.53, -.612, statusZ], [1.53, -.572, statusZ], [1.36, -.572, statusZ]], "#84d9ba", true);
      geometry.at(-1).overlay = statusZ;
    });
    if (command) {
      const shades = new Map([
        ["#1d3352", "#203833"], ["#243c59", "#394e47"], ["#5380a1", "#5d8774"],
        ["#426d91", "#426554"], ["#92e2ff", "#b9ffd0"], ["#98eaff", "#a6f2c1"],
        ["#78a5d2", "#9edeaa"], ["#6190bc", "#73b99b"], ["#487eaf", "#548978"]
      ]);
      for (let i = start; i < geometry.length; i++) {
        const face = geometry[i];
        if (shades.has(face.color)) face.color = shades.get(face.color);
      }
      for (const [y, x, length] of [[.48,.13,.89], [.48,1.02,.62], [-.37,.23,.80], [-.50,.45,.94]]) {
        standingPanel(x, y, .252, length, .038, .014, .01, "#9edeaa", "#9edeaa");
      }
    }
  }

  function battery() {
    slab(0, -.57, 0, 3.88, .14, 2.61, "#3e4041", "#5e635f", .16);
    slab(0, -.36, 0, 3.71, .26, 2.36, "#343d43", "#65716d", .13);
    for (const x of [-1.42, 1.42]) {
      for (const z of [-.93, .93]) {
        knob(x, -.21, z, .088, .025, "#93a5a1");
      }
    }
    slab(0, -.11, 0, 3.40, .31, 2.14, "#5c5541", "#6b684f", .14);
    for (let i = 0; i < 12; i++) {
      slab(-1.07 + i * .187, -.07, 1.071, .109, .13, .066, "#343b3d", "#647b6e", .014);
    }
    slab(0, .17, 0, 3.51, .22, 2.19, "#676853", "#787553", .16);
    slab(0, .306, 0, 3.18, .057, 1.89, "#856f49", "#3f4b49", .12);
    slab(0, .348, 0, 2.96, .028, 1.67, "#5b664f", "#374644", .105);
    movingPart(pulse(1.8), () => {
      surface([[.28,-.60],[-.48,.075],[-.064,.075],[-.236,.60],[.49,-.12],[.082,-.12]], .371, "#ffe2a0", true);
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = side * (.66 + .142 * i);
        slab(x, .373, .37, .084, .023, .48, "#5b7058", "#52644f", .021);
        movingPart(pulse(1.8, -i * .58), () => {
          surface(bevelRect(x, .37, .062, .395, .014), .387, "#b1e598", true);
        });
      }
      slab(side * 1.85, -.02, .0, .12, .18, .88, "#465255", "#839083", .08);
      for (const z of [-.68, .68]) {
        knob(side * 1.28, .363, z, .061, .016, "#8b816d", "#b2a485");
        trace(side * 1.28 - .025, z, side * 1.28 + .025, z, .382, .005, "#4e5047");
      }
      for (let i = 0; i < 8; i++) {
        slab(side * 1.831, -.211, -.84 + i * .24, .075, .136, .10, "#764c34", "#b8845e", .015);
      }
    }
  }

  function ram() {
    for (const [index, center] of [-.70, .66].entries()) {
      const y = index === 0 ? -.19 : -.39;
      slab(0, y, center, 4.16, .10, .99, "#293831", "#3c5147", .13);
      slab(0, y + .10, center - .14, 4.08, .14, .69, "#3d4144", "#677172", .11);
      slab(0, y + .23, center - .17, 3.85, .08, .47, "#5e6363", "#4b5050", .09);
      for (const shoulder of [-1, 1]) {
        slab(shoulder * 1.87, y + .172, center - .10, .13, .046, .46, "#767b76", "#a69679", .016);
      }
      for (let i = 0; i < 37; i++) {
        if (i === 18 || i === 19) continue;
        const x = -1.83 + i * .101;
        slab(x, y + .057, center + .421, .059, .024, .17, "#ae7745", "#e7b77c", .006);
      }
      for (let i = 0; i < 6; i++) {
        const x = -1.52 + i * .596;
        slab(x, y + .298, center - .15, .26, .027, .23, "#25292c", "#4b585a", .022);
        if (i % 2 === 0) {
          trace(x - .09, center - .19, x + .09, center - .19, y + .316, .007, "#bdad92");
        }
      }
      slab(0, y + .274, center - .40, 3.69, .034, .088, "#576568", "#929d96", .019);
      const glows = ["#a4e6bb", "#87cfd4", "#a0b7f5", "#ccb1eb", "#f1b996", "#c0e2aa"];
      for (let i = 0; i < glows.length; i++) {
        const x = -1.49 + i * .596;
        movingPart(pulse(1.88, -(i + index) * .70), () => {
          surface(bevelRect(x, center - .40, .550, .059, .014), y + .295, glows[i], true);
        });
        trace(x - .15, center + .041, x + .14, center + .041, y + .271, .009, "#94a29f");
      }
    }
  }

  function drive() {
    slab(0, -.32, 0, 4.28, .14, 1.71, "#263d35", "#365249", .12);
    slab(0, -.395, 0, 4.11, .059, 1.63, "#293733", "#6c966f", .11);
    for (let i = 0; i < 17; i++) {
      if (i === 10) continue;
      slab(-2.06, -.232, -.68 + i * .083, .23, .027, .055, "#97704c", "#efc48c", .008);
    }
    for (let i = 0; i < 4; i++) {
      const x = -.69 + i * .56;
      const z = i % 2 === 0 ? -.29 : .29;
      slab(x, -.146, z, .43, .17, .43, "#303436", "#4e5455", .042);
      for (let j = 0; j < 7; j++) {
        const offset = -.164 + j * .055;
        slab(x + offset, -.205, z - .219, .027, .053, .095, "#9d825d", "#c7a982", .006);
        slab(x + offset, -.205, z + .219, .027, .053, .095, "#9d825d", "#c7a982", .006);
      }
    }
    slab(-1.37, -.125, 0, .56, .22, .52, "#333739", "#565f5f", .05);
    slab(-1.37, .006, 0, .42, .045, .38, "#6b6861", "#7c7b6d", .038);
    ring(-1.37, .033, 0, .087, .104, "#daa974", 18, .075);
    movingPart(pulse(2.25), () => surface(circle(-1.37, 0, .065, 18), .038, "#f7c884", true));
    for (let i = 0; i < 8; i++) {
      const x = -.86 + i * .285;
      for (const side of [-1, 1]) {
        slab(x, -.232, side * .686, .113, .055, .095, "#61756c", "#96a18a", .013);
        trace(x - .022, side * .638, x + .095, side * .566, -.244, .009, "#8f997c");
      }
    }
    movingPart((time) => ({ x: .63 - .63 * Math.cos(time * 1.4) }), () => {
      surface(bevelRect(-.53, .758, .16, .053, .012), -.231, "#90ddaa", true);
    });
    for (const x of [-1.65, .97, 1.47]) {
      for (const z of [-.52, .52]) {
        const direction = Math.sign(z);
        trace(x - .23, z, x - .07, z - .17 * direction, -.243, .013, "#a88f6e");
        trace(x - .07, z - .17 * direction, x + .19, z - .17 * direction, -.243, .013, "#a88f6e");
        knob(x + .19, -.244, z - .17 * direction, .033, .022, "#b19972", "#e3c39b");
      }
    }
    knob(1.83, -.244, 0, .168, .036, "#6f746b", "#b7b5a0");
    knob(1.83, -.202, 0, .074, .019, "#253530", "#2b3b36");
  }

  function mouse() {
    const length = 1.56;
    const tau = 2 * Math.PI;
    const top = Math.PI / 2;
    const wheelZ = .64;

    // Elliptical cross sections narrow at the waist and round off at the ends.
    function shellPoint(angle, z) {
      const end = Math.sqrt(Math.max(0, 1 - (z / length) ** 2));
      const waist = Math.exp(-(((z - .14) / .45) ** 2));
      const width = Math.pow(end, .73) * (.99 - .10 * waist + .065 * Math.tanh(z * 2));
      const shoulder = -.28 - .07 * Math.max(0, z);
      const profile = Math.sin(angle) >= 0 ? end * (.77 - .18 * Math.tanh((z - .03) * 1.55)) : .28 * end;
      return [width * Math.cos(angle), shoulder + profile * Math.sin(angle), z];
    }

    function onShell(angle, z, raise = 0) {
      const point = shellPoint(angle, z);
      const a = shellPoint(angle - .001, z), b = shellPoint(angle + .001, z);
      const c = shellPoint(angle, z - .001), d = shellPoint(angle, z + .001);
      const [ax, ay] = [b[0] - a[0], b[1] - a[1]];
      const [bx, by, bz] = d.map((value, i) => value - c[i]);
      const normal = [ay * bz, -ax * bz, ax * by - ay * bx];
      const magnitude = Math.hypot(...normal);
      const unit = magnitude > 0 ? normal.map((value) => value / magnitude) : [0, 0, Math.sign(z)];
      return { point: point.map((value, i) => value + unit[i] * raise), normal: unit };
    }

    function skin(points, color, lit = false) {
      face(points.map((point) => point.point), color, lit, points.map((point) => point.normal));
    }

    const angles = 40, slices = 38;
    const rows = Array.from({ length: slices + 1 }, (_, row) => {
      const z = length * Math.sin(Math.PI * (row / slices - .5));
      return Array.from({ length: angles }, (_, i) => onShell(i * tau / angles, z));
    });
    for (let row = 0; row < slices; row++) {
      const [rear, front] = [rows[row], rows[row + 1]];
      for (let i = 0; i < angles; i++) {
        const next = (i + 1) % angles;
        const above = i < angles / 2;
        const click = above && rear[i].point[2] >= .25;
        const color = click ? "#748996" : above ? "#526b7a" : "#283847";
        if (row === 0) skin([rear[i], front[next], front[i]], color);
        else if (row === slices - 1) skin([rear[i], rear[next], front[i]], color);
        else skin([rear[i], rear[next], front[next], front[i]], color);
      }
    }

    function band(angleAt, zAt, from, to, steps, color, lit = false) {
      const left = (t) => onShell(angleAt(t)[0], zAt(t)[0], .008);
      const right = (t) => onShell(angleAt(t)[1], zAt(t)[1], .008);
      for (let i = 0; i < steps; i++) {
        const start = from + (to - from) * i / steps;
        const end = from + (to - from) * (i + 1) / steps;
        skin([left(start), right(start), right(end), left(end)], color, lit);
      }
    }

    // Molded button seams sit on the same dome as the rest of the mouse.
    band(() => [top - .019, top + .019], (z) => [z, z], .27, 1.554, 24, "#222832");
    band((angle) => [angle, angle], () => [.284, .26], .055, Math.PI - .055, 32, "#303b43");
    function inset(angle, z, width, depth, color, raise = .012, lit = false) {
      const center = onShell(angle, z, raise);
      const border = Array.from({ length: 36 }, (_, i) => {
        const step = i * tau / 36;
        return onShell(angle + width * Math.cos(step), z + depth * Math.sin(step), raise);
      });
      border.forEach((point, i) => skin([center, point, border[(i + 1) % border.length]], color, lit));
    }

    inset(top, wheelZ, .223, .280, "#152536");
    inset(top, -.74, .139, .123, "#52616c");
    inset(top, .352, .093, .059, "#283843", .020);
    movingPart(pulse(1.72), () => {
      for (const angle of [-.07, Math.PI + .07]) {
        band(() => [angle - .030, angle + .030], (z) => [z, z], -1.29, .87, 30, "#efab83", true);
      }
      inset(top, -.74, .106, .096, "#ecab85", .020, true);
      inset(top, .352, .060, .031, "#9cead7", .026, true);
    });
    inset(top, -.74, .065, .060, "#425665", .028);
    for (const z of [-.29, .08]) {
      inset(Math.PI - .15, z, .147, .161, "#1d303a", .018);
      inset(Math.PI - .15, z, .096, .132, "#617684", .030);
    }
    for (let i = 0; i < 5; i++) {
      inset(Math.PI - .16, -.64 - i * .093, .033, .021, "#8295a0", .021);
    }
    const underside = Math.PI * 1.5;
    for (const z of [-1.17, 1.18]) {
      inset(underside, z, .47, .124, "#7c8990", .022);
      inset(underside, z, .406, .092, "#a0b2b5", .033);
    }
    inset(underside, -.035, .164, .166, "#1b2732");
    inset(underside, -.035, .090, .087, "#314b62", .020);

    // Beveled tread and slim metal rims above the recessed wheel opening.
    const segments = 36;
    const rings = [[-.133, .114], [-.119, .141], [-.095, .152], [.095, .152], [.119, .141], [.133, .114]]
      .map(([x, radius]) => Array.from({ length: segments }, (_, i) => {
        const angle = i * tau / segments;
        return [x, .297 + Math.cos(angle) * radius, wheelZ + Math.sin(angle) * radius];
      }));
    face([...rings[0]].reverse(), "#38424b");
    face(rings.at(-1), "#38424b");
    for (let row = 0; row < rings.length - 1; row++) {
      const [left, right] = [rings[row], rings[row + 1]];
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const color = row === 2 ? (i % 2 === 0 ? "#677780" : "#373f47") : "#c3a48e";
        face([left[i], left[next], right[next], right[i]], color);
      }
    }
  }

  function display() {
    slab(0, -1.21, .09, 2.01, .052, .91, "#222b36", "#68757b", .18);
    slab(0, -1.17, .09, 1.96, .046, .87, "#394954", "#72848a", .17);
    slab(0, -1.129, -.20, .72, .051, .46, "#425765", "#61737d", .10);
    slab(0, -.86, -.24, .33, .59, .22, "#364753", "#677c82", .05);
    standingPanel(0, -.44, -.228, .66, .58, .25, .101, "#334a56", "#546872");
    standingPanel(0, .24, -.132, 2.94, 1.66, .29, .22, "#2e424e", "#435a65");
    standingPanel(0, .24, .018, 4.17, 2.31, .170, .126, "#4c616b", "#748b93");
    standingPanel(0, .26, .115, 4.08, 2.20, .058, .092, "#2a3f4a", "#233847");
    standingPanel(0, .278, .149, 3.950, 2.046, .021, .047, "#2e4857", "#12303d");
    standingPanel(0, .294, .166, 3.80, 1.86, .009, .041, "#122835", "#142837");

    for (let i = -8; i <= 8; i++) {
      standingPanel(i * .105, .944, -.281, .065, .056, .013, .010, "#283843", "#324752");
    }
    for (const x of [-.90, -.64, .64, .90]) {
      standingPanel(x, -.479, -.281, .156, .060, .012, .014, "#18272e", "#283d45");
    }
    const screen = geometry.length;
    const rect = (x0, y0, x1, y1, z, color, lit = false) =>
      face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], color, lit);
    rect(-1.87, .89, 1.87, 1.18, .177, "#284b5d");
    for (const [x, color] of [[-1.70, "#80e3d4"], [-1.56, "#78a8ca"], [-1.42, "#4a6e82"]]) {
      rect(x, 1.014, x + .063, 1.064, .183, color, true);
    }
    rect(-1.25, 1.007, -.75, 1.068, .181, "#51768d", true);
    rect(1.24, 1.011, 1.68, 1.060, .181, "#649d9e", true);
    rect(-1.86, -.57, -1.31, .86, .179, "#1c3446");
    for (const [i, color] of ["#72dfd5", "#91bff4", "#d89b8e"].entries()) {
      const y = .65 - i * .32;
      rect(-1.72, y, -1.615, y + .049, .186, color, true);
      rect(-1.55, y, -1.42, y + .034, .185, "#a8aeb9", true);
      rect(-1.72, y - .087, -1.49, y - .063, .187, "#627c8d", true);
    }
    const left = -1.19, right = 1.73, bottom = -.448, upper = .826;
    rect(left, bottom, right, upper, .179, "#102c3c");
    for (let i = 0; i <= 8; i++) {
      const x = left + i * (right - left) / 8;
      rect(x, bottom, x + .008, upper, .185, "#294858");
    }
    for (let i = 0; i <= 4; i++) {
      const y = bottom + i * (upper - bottom) / 4;
      rect(left, y, right, y + .009, .186, "#294858");
    }

    const pale = (t) => .18 + .225 * Math.sin(t * 16 - 1.0) + .12 * Math.sin(t * 37 - .6) + .23 * t;
    const blue = (t) => -.15 + .11 * Math.sin(t * 13 - .7) + .05 * Math.sin(t * 27) + .13 * t;
    function wave(signal, color, z) {
      let x0 = left, y0 = signal(0);
      for (let i = 1; i <= 82; i++) {
        const t = i / 82, x = left + t * (right - left), y = signal(t);
        face([[x0, y0 - .016, z], [x, y - .016, z], [x, y + .016, z], [x0, y0 + .016, z]], color, true);
        x0 = x;
        y0 = y;
      }
    }
    wave(blue, "#8bb7ee", .191);
    wave(pale, "#7ef2db", .194);
    movingPart((time) => {
      const t = .50 - .47 * Math.cos(time * 1.62);
      return { x: left + t * (right - left), y: pale(t) };
    }, () => {
      const points = circle(0, 0, .058, 16).map(([x, y]) => [x, y, .209]);
      face(points, "#c7fff4", true);
    });
    movingPart((time) => ({ x: .5 * (right - left) * (1 - Math.cos(time * 1.62)) * .94 }), () => {
      rect(left + .071, bottom, left + .084, upper, .188, "#487882", true);
    });
    // Keep the display's flat graphics above the bezel in the Canvas renderer.
    for (let i = screen; i < geometry.length; i++) {
      geometry[i].overlay = geometry[i].vertices[0][2];
    }

    standingPanel(1.59, -.855, .118, .079, .021, .018, .009, "#6bada3", "#c4f5de");
    for (let i = 0; i < 3; i++) {
      slab(1.26 + i * .111, -.923, .074, .061, .025, .062, "#31424c", "#516a77", .013);
    }
  }

  const builders = { chip, vault, gpu, ram, drive, terminal, battery, mouse, display, command: () => terminal(true) };
  const rgb = new Map();
  function colorWithLight(hex, light) {
    if (!rgb.has(hex)) {
      rgb.set(hex, [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16)));
    }
    const [r, g, b] = rgb.get(hex);
    return `rgb(${Math.min(255, r * light)} ${Math.min(255, g * light)} ${Math.min(255, b * light)})`;
  }

  function render(timestamp) {
    frame = 0;
    if (!mode || document.hidden || (!depth && !ctx)) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pixelRatio = Math.min(2, devicePixelRatio || 1);
    const width = Math.round(w * pixelRatio), height = Math.round(h * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ox = w * .49, oy = h * camera.center;
    const scale = Math.min(w * .177, h * .271) * camera.zoom;
    const animates = animated && !reducedMotion.matches;
    const time = animates ? Math.max(0, (timestamp - startedAt) / 1000) : 0;
    if (animates && inView) {
      animationTimer = window.setTimeout(schedule, depth ? 18 : 48);
    }
    if (depth) {
      depth.render(camera, [2 * scale / w, 2 * scale / h], [2 * ox / w - 1, 1 - 2 * oy / h], time);
      return;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cosY = Math.cos(camera.yaw), sinY = Math.sin(camera.yaw);
    const cosX = Math.cos(camera.pitch), sinX = Math.sin(camera.pitch);

    const glow = ctx.createRadialGradient(ox, oy, 6, ox, oy, scale * 2.45);
    glow.addColorStop(0, camera.accent + "24");
    glow.addColorStop(1, camera.accent + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy + scale * .99);
    ctx.scale(1, .25);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, scale * 2.09);
    shadow.addColorStop(0, "#000b");
    shadow.addColorStop(.70, "#050a157a");
    shadow.addColorStop(1, "#08142600");
    ctx.fillStyle = shadow;
    ctx.fillRect(-scale * 2.1, -scale * 2.1, scale * 4.2, scale * 4.2);
    ctx.restore();

    const rotate = ([x, y, z]) => {
      const a = x * cosY + z * sinY, b = -x * sinY + z * cosY;
      return [a, y * cosX - b * sinX, y * sinX + b * cosX];
    };
    const polygons = [];
    const poses = new Map();
    for (const polygon of geometry) {
      let light = 1, position = rotate;
      if (polygon.motion) {
        if (!poses.has(polygon.motion)) {
          const { angle = 0, pivotX = 0, x = 0, y = 0, light = 1 } = polygon.motion(time);
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const position = ([px, py, pz]) => rotate([
            pivotX + (px - pivotX) * cos - pz * sin + x, py + y, (px - pivotX) * sin + pz * cos
          ]);
          poses.set(polygon.motion, { position, light });
        }
        ({ position, light } = poses.get(polygon.motion));
      }
      const points = polygon.vertices.map(position);
      const [p, q, r] = points;
      const a = q.map((v, i) => v - p[i]), b = r.map((v, i) => v - q[i]);
      const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2];
      const nz = a[0] * b[1] - a[1] * b[0];
      if (nz <= 0.0000001) continue;
      const divisor = Math.hypot(nx, ny, nz);
      const lighting = polygon.bright ? 1.16 * light : .80 + .49 * Math.max(0, (-nx * .43 + ny * .76 + nz * .47) / divisor);
      const z = points.reduce((sum, point) => sum + point[2], 0) / points.length;
      polygons.push({ points, z, overlay: polygon.overlay ?? 0, lighting, color: polygon.color, edges: !polygon.bright && !polygon.normals });
    }
    polygons.sort((a, b) => a.overlay - b.overlay || a.z - b.z);
    for (const polygon of polygons) {
      ctx.beginPath();
      polygon.points.forEach(([x, y, z], i) => {
        const perspective = 8 / (8 - z);
        const px = ox + x * scale * perspective, py = oy - y * scale * perspective;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = colorWithLight(polygon.color, polygon.lighting);
      ctx.fill();
      if (polygon.edges) {
        ctx.strokeStyle = "#abdfff33";
        ctx.lineWidth = .61;
        ctx.stroke();
      }
    }
  }

  function schedule() {
    clearTimeout(animationTimer);
    if (mode && !frame && !document.hidden) frame = requestAnimationFrame(render);
  }

  function reset() {
    if (!mode) return;
    camera = { ...defaults[mode] };
    schedule();
  }

  function setMode(next) {
    if (mode === next) return;
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(animationTimer);
    frame = 0;
    mode = next;
    startedAt = performance.now();
    stage.dataset.scene = mode;
    if (!mode) return;
    if (!models.has(mode)) {
      geometry = [];
      builders[mode]();
      models.set(mode, geometry);
    }
    geometry = models.get(mode);
    animated = geometry.some((polygon) => polygon.motion);
    depth?.setGeometry(geometry);
    reset();
  }

  function rotate(dx, dy) {
    camera.yaw = camera.yaw + dx;
    camera.pitch = Math.max(-.70, Math.min(1.40, camera.pitch + dy));
    schedule();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !mode || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    rotate((event.clientX - drag.x) * .012, (event.clientY - drag.y) * .012);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(event, (e) => {
      if (drag?.id === e.pointerId) drag = null;
    });
  }
  canvas.addEventListener("keydown", (event) => {
    const movement = { ArrowLeft: [-.14, 0], ArrowRight: [.14, 0], ArrowUp: [0, -.14], ArrowDown: [0, .14] };
    if (movement[event.key]) {
      event.preventDefault();
      rotate(...movement[event.key]);
    }
  });
  new ResizeObserver(schedule).observe(stage);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) schedule();
    else clearTimeout(animationTimer);
  }).observe(stage);
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", schedule);
  canvas.addEventListener("webglcontextrestored", () => {
    depth?.setGeometry(geometry);
    schedule();
  });
  return { setMode, reset };
};
