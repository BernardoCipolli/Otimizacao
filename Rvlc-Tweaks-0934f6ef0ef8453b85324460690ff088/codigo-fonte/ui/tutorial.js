"use strict";

window.createTutorial = function (root, onRender) {
  const steps = window.rvlcTutorial;
  const id = (name) => document.getElementById(name);
  const heading = id("tutorial-title");
  const back = id("tutorial-back");
  const skip = id("tutorial-skip");
  const next = id("tutorial-next");
  const feedback = id("tutorial-feedback");
  const picture = id("tutorial-image");
  const maxMask = (1 << steps.length) - 1;
  let progress = { step: 0, done: 0 };
  try {
    const saved = JSON.parse(root.dataset.progress);
    if (Number.isInteger(saved.step) && saved.step >= 0 && saved.step < steps.length &&
        Number.isInteger(saved.done) && saved.done >= 0 && saved.done <= maxMask) {
      progress = saved;
    }
  } catch {
    // A missing or unreadable preference starts at the first stage.
  }

  let rendered = -1;
  let shownIllustration = "";
  let queuedSave = Promise.resolve();
  let saveRevision = 0;

  function element(tag, text = "", className = "") {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function icon(name) {
    const el = element("i", "", "icon");
    el.dataset.icon = name;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function save() {
    if (typeof window.rvlcSaveTutorial !== "function") return;
    const { step, done } = progress;
    const revision = ++saveRevision;
    queuedSave = queuedSave.then(async () => {
      let saved = false;
      try {
        saved = await window.rvlcSaveTutorial(window.rvlcSession, step, done);
      } catch {
        // Preserve the current stage in this window even if saving fails.
      }
      if (revision !== saveRevision) return;
      feedback.textContent = saved
        ? done === maxMask ? "Tutorial concluído. Progresso salvo." : "Progresso salvo."
        : "Não foi possível salvar o progresso neste PC.";
    });
  }

  function go(target, done = progress.done) {
    progress = { step: Math.max(0, Math.min(steps.length - 1, target)), done };
    render();
    save();
    window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
  }

  function showIllustration(current, index) {
    const task = current.items[index];
    const key = progress.step + ":" + (task.route ? index : "default");
    if (key === shownIllustration) return;
    shownIllustration = key;
    picture.src = tutorialPicture(task.visual || current.visual, progress.step);
    picture.alt = "Ilustração de " + (task.route ? task.title : current.title);
    id("tutorial-route").replaceChildren(...(task.route || current.route).map((piece) => element("li", piece)));
  }

  function render() {
    const { step, done } = progress;
    const current = steps[step];
    const count = steps.reduce((sum, _, index) => sum + Number(Boolean(done & (1 << index))), 0);
    id("tutorial-position").textContent = `Etapa ${step + 1} de ${steps.length}`;
    id("tutorial-count").textContent = `${count} de ${steps.length} concluídas`;
    id("tutorial-meter").max = steps.length;
    id("tutorial-meter").value = count;
    heading.textContent = current.title;
    id("tutorial-intro").textContent = current.summary;
    const note = id("tutorial-note");
    note.hidden = !current.note;
    note.textContent = current.note || "";

    const items = id("tutorial-items");
    items.replaceChildren();
    current.items.forEach((task, index) => {
      const details = element("details", "", "tutorial-item");
      details.name = "tutorial-current";
      details.open = index === 0;
      const summary = element("summary");
      const marker = element("span", String(index + 1), "tutorial-marker");
      marker.setAttribute("aria-hidden", "true");
      summary.append(marker, element("span", task.title), icon("arrow"));
      const body = element("div", "", "tutorial-task");
      body.append(element("p", task.text));
      if (task.links.length) {
        const actions = element("div", "", "tutorial-links");
        for (const link of task.links) {
          const button = element("button", link.label, "secondary");
          button.type = "button";
          if (link.action) button.dataset.action = link.action;
          if (link.tab) button.dataset.tab = link.tab;
          button.append(icon(link.tab ? "arrow" : "external"));
          actions.append(button);
        }
        body.append(actions);
      }
      details.append(summary, body);
      details.addEventListener("toggle", () => {
        if (details.open && details.isConnected && progress.step === step) showIllustration(current, index);
      });
      items.append(details);
    });
    showIllustration(current, 0);

    const last = step === steps.length - 1;
    const completed = Boolean(done & (1 << step));
    back.disabled = step === 0;
    skip.hidden = last || completed;
    next.disabled = last && completed;
    const label = last ? completed ? "Etapa concluída" : "Concluir etapa"
      : completed ? "Avançar" : "Concluir e avançar";
    next.replaceChildren(label, icon(last ? "check" : "arrow"));
    feedback.textContent = done === maxMask ? "Tutorial concluído." : "";
    rendered = step;
    onRender();
  }

  back.addEventListener("click", () => go(progress.step - 1));
  skip.addEventListener("click", () => go(progress.step + 1));
  next.addEventListener("click", () => go(progress.step + 1, progress.done | (1 << progress.step)));

  return {
    show() {
      if (rendered !== progress.step) render();
    }
  };
};

function tutorialPicture(kind, step) {
  const picture = document.createElement("canvas");
  picture.width = 620;
  picture.height = 290;
  const ctx = picture.getContext("2d");
  const palettes = ["#ffbf83", "#a2e5c2", "#a9c9fa", "#d6b9ed"];
  const ink = palettes[step % palettes.length];
  const bg = ctx.createLinearGradient(0, 0, 600, 277);
  bg.addColorStop(0, "#171f21");
  bg.addColorStop(1, "#0d1214");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 620, 290);
  const glow = ctx.createRadialGradient(355, 120, 10, 355, 120, 300);
  glow.addColorStop(0, ink + "50");
  glow.addColorStop(1, ink + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 620, 290);

  ctx.strokeStyle = "#ffffff13";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 20; x < 620; x += 29) { ctx.moveTo(x, 0); ctx.lineTo(x, 290); }
  for (let y = 5; y < 290; y += 29) { ctx.moveTo(0, y); ctx.lineTo(620, y); }
  ctx.stroke();
  ctx.strokeStyle = ink + "60";
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[24, 24, 18, 18], [596, 24, -18, 18], [24, 266, 18, -18], [596, 266, -18, -18]]) {
    ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy);
  }
  ctx.stroke();
  ctx.fillStyle = "#101719";
  ctx.strokeStyle = ink + "70";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(176, 34, 268, 221, 24);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(310, 145);
  ctx.scale(1.23, 1.23);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const line = (...points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.stroke();
  };
  const box = (x, y, width, height, radius = 5) => {
    ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.stroke();
  };
  const circle = (x, y, radius) => {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  };
  const text = (label, x, y, size = 23) => {
    ctx.font = `700 ${size}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, x, y);
  };
  const arrow = (x, y) => line([x, y - 15], [x, y + 15], [x - 9, y + 6], [x, y + 15], [x + 9, y + 6]);

  switch (kind) {
    case "display":
      box(-63, -38, 126, 70, 7);
      line([0, 33], [0, 49], [-21, 49], [21, 49]);
      text("Hz", 0, 7, 29);
      break;
    case "audio":
      ctx.beginPath(); ctx.arc(0, 1, 43, Math.PI, 2 * Math.PI); ctx.stroke();
      box(-51, 0, 20, 37, 7); box(31, 0, 20, 37, 7);
      line([-16, 18], [-10, 18], [-4, 4], [4, 30], [11, 18], [17, 18]);
      break;
    case "terminal":
      box(-67, -46, 134, 89, 8);
      line([-65, -26], [65, -26]);
      line([-45, -7], [-29, 5], [-45, 17]);
      line([-15, 18], [5, 18]);
      line([18, -4], [45, -4]); line([18, 8], [35, 8]);
      break;
    case "restart":
    case "update":
      ctx.beginPath(); ctx.arc(0, 0, 41, -.78, 4.79); ctx.stroke();
      line([29, -30], [37, -18], [39, -35]);
      if (kind === "update") arrow(0, 0);
      else line([-9, 0], [-2, 8], [14, -11]);
      break;
    case "battery":
      box(-58, -29, 111, 59, 8);
      line([59, -11], [66, -11], [66, 11], [59, 11]);
      line([-6, -19], [-21, 3], [-4, 3], [-7, 20], [17, -6], [1, -6], [7, -19]);
      break;
    case "gpu":
      box(-69, -30, 133, 67, 9);
      circle(-34, 3, 20); circle(26, 3, 20);
      circle(-34, 3, 5); circle(26, 3, 5);
      line([-55, 44], [-12, 44], [-8, 38]); line([65, -39], [70, -39], [70, 43]);
      break;
    case "priority":
      box(-64, -40, 128, 80, 9);
      line([-63, -20], [63, -20]);
      line([-44, 0], [-32, 0]); line([-44, 17], [-32, 17]);
      box(-13, -5, 62, 32, 5); text("High", 18, 17, 16);
      break;
    case "file":
      line([-38, -49], [13, -49], [39, -24], [39, 46], [-38, 46], [-38, -49]);
      line([13, -48], [13, -23], [38, -23]);
      text(step === 10 ? ".REG" : ".BAT", 0, 13, 20);
      break;
    case "apps":
      for (const [x, y] of [[-46,-46],[6,-46],[-46,6],[6,6]]) box(x, y, 40, 40, 6);
      circle(-26, -26, 10);
      line([19,-28],[24,-22],[33,-32]);
      line([-37,26],[-15,26]);
      arrow(26, 25);
      break;
    case "input":
      box(-72, -24, 90, 48, 7); box(35, -34, 34, 67, 15);
      line([52, -30], [52, -10]);
      for (const y of [-10, 1, 12]) line([-61, y], [5, y]);
      break;
    case "chip":
      box(-36, -36, 72, 72, 9); box(-19, -19, 38, 38, 6);
      for (const pos of [-24, -8, 8, 24]) {
        line([pos, -37], [pos, -50]); line([pos, 37], [pos, 50]);
        line([-37, pos], [-50, pos]); line([37, pos], [50, pos]);
      }
      break;
    case "folder":
      line([-65, -37], [-20, -37], [-9, -23], [58, -23], [58, 39], [-65, 39], [-65, -37]);
      line([-43, 18], [37, 18]); line([-43, 5], [17, 5]);
      break;
    case "game":
      line([-52, -26], [52, -26], [65, 26], [50, 35], [26, 17], [-26, 17], [-50, 35], [-65, 26], [-52, -26]);
      line([-41, -4], [-17, -4]); line([-29, -16], [-29, 8]);
      circle(32, -8, 5); circle(44, 5, 5);
      break;
    case "camera":
      box(-65, -27, 130, 75, 8); circle(0, 11, 24); circle(0, 11, 13);
      line([-38, -27], [-31, -40], [2, -40], [12, -27]);
      circle(49, -10, 4);
      break;
    default:
      box(-56, -37, 112, 80, 8);
      line([-55, -14], [55, -14], [55, 17]);
      arrow(0, 13);
      line([-24, 31], [24, 31]);
      break;
  }
  ctx.restore();
  return picture.toDataURL("image/png");
}
