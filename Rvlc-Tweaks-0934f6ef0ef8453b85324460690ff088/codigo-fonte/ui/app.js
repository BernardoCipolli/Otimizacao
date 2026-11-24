"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const tabs = {
    optimize: {
      title: ["Seu PC", "em foco."], text: "Explore seus componentes em 3D e veja os ajustes indicados para esta máquina.",
      analyze: true, model: "chip", modelLabel: "Processador e placa de circuito em 3D", icon: "tools"
    },
    mouse: {
      title: ["Mouse"], text: "Abra as propriedades do mouse no Windows para ajustar o ponteiro, os botões e a roda.",
      model: "mouse", modelLabel: "Mouse em 3D"
    },
    monitor: {
      title: ["Monitor"], text: "Abra as configurações do Windows para escolher o monitor e ajustar a taxa de atualização (Hz).",
      model: "display", modelLabel: "Monitor em 3D"
    },
    cleanup: {
      title: ["Limpeza"], text: "Baixe os scripts originais. Ao executar, eles podem apagar logs do Windows e arquivos da Lixeira.",
      model: "vault", modelLabel: "Unidades de armazenamento em 3D"
    },
    gpu: {
      title: ["GPU NVIDIA"], text: "Baixe as ferramentas que você usa para revisar perfis do driver e configurações da placa.",
      button: "Abrir Gerenciador de Dispositivos", action: "devices", model: "gpu", modelLabel: "Placa de vídeo com duas ventoinhas em 3D", icon: "external"
    },
    powershell: {
      title: ["PowerShell"], text: "Consulte as instruções e os arquivos dos projetos no GitHub.",
      button: "Abrir PowerShell", action: "powershell", model: "terminal", modelLabel: "Terminal do PowerShell em 3D", icon: "terminal"
    },
    power: {
      title: ["Planos de", "energia"], text: "Escolha um plano instalado ou importe um arquivo .pow. Use Aplicar plano para ativá-lo.",
      model: "battery", modelLabel: "Unidade de energia em 3D"
    },
    cmd: { title: ["CMD"], text: "Consulte e gerencie serviços do Windows na seção FiveM.",
      model: "command", modelLabel: "Terminal com linhas de código em 3D" },
    tutorial: {},
    history: {}
  };

  const confirmation = {
    capture: ["Desativar a captura em segundo plano?", "A gravação automática e o comando de capturar os últimos segundos podem parar de funcionar. Você poderá desfazer o ajuste pelo Histórico.", "Desativar captura"],
    undo: ["Desfazer a alteração mais recente?", "Os valores de captura voltam à configuração anterior. Arquivos em quarentena voltam aos caminhos originais que estiverem disponíveis.", "Desfazer ação"]
  };
  const actionLabels = {
    state: "Carregando os ajustes…", capture: "Aplicando o ajuste de captura…",
    undo: "Restaurando a alteração…",
    "plan-list": "Consultando os planos do Windows…", "plan-import": "Aguardando a seleção do arquivo .pow…",
    "plan-apply": "Ativando o plano selecionado…",
    "get-optimizer": "Baixando Optimizer do GitHub…",
    "get-reset-cache": "Salvando ResetCacheSystem.bat…",
    "get-cleanup-bat": "Salvando 1._Limpar_Arquivos_de_Lixo.bat…",
    "t-display": "Abrindo as configurações de tela…",
    "service-list": "Consultando serviços do Windows…",
    "service-change": "Aguardando o Windows atualizar o serviço…"
  };
  const names = { capture: "Captura em segundo plano", clean: "Limpeza de temporários" };
  const states = {
    pending: "Interrompida", applied: "Aplicada", undone: "Desfeita",
    purged: "Quarentena esvaziada", partial: "Reversão parcial"
  };
  const serviceNames = {
    dps: ["DPS", "Serviço de Política de Diagnóstico"],
    diagtrack: ["DiagTrack", "Experiências do Usuário Conectado e Telemetria"],
    pcasvc: ["PcaSvc", "Assistente de Compatibilidade de Programas"],
    sysmain: ["SysMain", "Serviço de cache e desempenho do Windows"]
  };
  const serviceStates = { running: "Em execução", stopped: "Parado", pending: "Em transição", paused: "Pausado", missing: "Ausente", unknown: "Indisponível" };
  const serviceStartups = { auto: "Automática", manual: "Manual", disabled: "Desabilitada", unknown: "Indisponível" };
  const captureLabels = { available: "Ajuste disponível", disabled: "Captura desativada", unknown: "Configuração indisponível" };
  const scene = window.makeScene(byId("model"));
  const hero = byId("hero"), heroButton = byId("hero-action"), showcase = byId("showcase");
  const nav = byId("top-nav"), navIndicator = byId("nav-indicator");
  const navButtons = document.querySelectorAll(".nav-btn, .history-link");
  const componentLabels = { cpu: "processador", gpu: "placa de vídeo", ram: "memória RAM", disk: "armazenamento" };
  const dialog = byId("confirm"), planList = byId("plan-list");
  const formatDay = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const formatNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  let active = "tutorial", busy = "", lastRequest = 0, pendingConfirm = null;
  let navFrame = 0;
  let snapshot = null, power = null, selectedPlan = "", timer;
  let services = [], monitorTimer = 0, monitorPending = false;
  let selectedComponent = "cpu", latestMetrics = null, history = [];
  let expectedInspection = null, inspectionRequestedAt = 0, inspectNext = false;
  let inventoryKey, recommendationKey;
  const tutorial = window.createTutorial(byId("page-tutorial"), updateButtons);

  function node(tag, text = "", className = "") {
    const item = document.createElement(tag);
    item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function icon(name) {
    const item = node("i", "", "icon");
    item.dataset.icon = name;
    item.setAttribute("aria-hidden", "true");
    return item;
  }

  function navigate(tab) {
    if (!Object.hasOwn(tabs, tab)) return;
    if (active !== tab) {
      active = tab;
      renderTab();
    }
    window.scrollTo(0, 0);
  }

  function scheduleNavIndicator() {
    if (navFrame) return;
    navFrame = requestAnimationFrame(() => {
      navFrame = 0;
      const selected = nav.querySelector("[aria-current]");
      if (selected) {
        const tab = selected.getBoundingClientRect();
        const rail = nav.getBoundingClientRect();
        navIndicator.style.width = tab.width + "px";
        navIndicator.style.height = tab.height + "px";
        navIndicator.style.transform = `translate(${tab.left - rail.left}px, ${tab.top - rail.top - nav.clientTop}px)`;
      }
      navIndicator.hidden = !selected;
    });
  }

  function renderTab() {
    const tab = tabs[active];
    document.querySelectorAll(".page").forEach((page) => { page.hidden = page.id !== "page-" + active; });
    navButtons.forEach((button) => {
      if (button.dataset.tab === active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    scheduleNavIndicator();
    hero.hidden = !tab.model;
    showcase.hidden = !tab.model;
    const dashboard = active === "optimize";
    showcase.dataset.dashboard = String(dashboard);
    for (const id of ["component-selector", "model-caption", "recommendations"]) {
      byId(id).hidden = !dashboard;
    }
    if (tab.model) {
      const title = byId("hero-title");
      title.replaceChildren(tab.title[0]);
      if (tab.title.length > 1) title.append(document.createElement("br"), tab.title[1]);
      byId("hero-text").textContent = tab.text;
      hero.dataset.variant = tab.model;
      heroButton.hidden = !tab.action && !tab.analyze;
      delete heroButton.dataset.action;
      delete heroButton.dataset.analyze;
      if (tab.action) heroButton.dataset.action = tab.action;
      if (tab.analyze) heroButton.dataset.analyze = "";
      if (!heroButton.hidden) renderHeroAction();
      byId("model").setAttribute("aria-label", tab.modelLabel);
    }
    if (dashboard) {
      renderComponent();
      drawUsage();
    } else {
      scene.setMode(tab.model || "");
    }
    syncMonitor();
    if (active === "tutorial") tutorial.show();
    updateButtons();
  }

  function updateButtons() {
    for (const button of document.querySelectorAll("[data-action], [data-confirm]")) {
      button.disabled = !!busy || button.dataset.unavailable === "true";
    }
    if (active === "optimize") heroButton.disabled = expectedInspection !== null;
    byId("apply-capture").disabled ||= snapshot?.capture !== "available";
    byId("undo-button").disabled ||= !snapshot?.undo;
    byId("apply-plan").disabled ||= !selectedPlan || selectedPlan === power?.active;
    planList.disabled = !!busy;
  }

  function displayStatus(message, tone = "ready", downloaded = false) {
    const status = byId("status");
    status.hidden = !message;
    status.dataset.tone = tone;
    byId("status-message").replaceChildren(icon(tone === "error" ? "alert" : tone === "busy" ? "rotate" : "check"), node("span", message));
    byId("download-folder").hidden = !downloaded;
  }

  function useTheme(theme) {
    document.documentElement.dataset.theme = theme;
    drawUsage();
    for (const button of document.querySelectorAll("[data-theme-choice]")) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    }
  }

  async function copyProjectLink(id) {
    try {
      if (await window.rvlcCopy?.(window.rvlcSession, id)) {
        displayStatus("Link copiado. Cole no navegador para abrir o projeto.");
        return;
      }
    } catch {
      // The link remains selectable in the interface.
    }
    displayStatus("Selecione o endereço e pressione Ctrl+C para copiar.", "error");
  }

  async function chooseTheme(theme) {
    if (document.documentElement.dataset.theme === theme) return;
    useTheme(theme);
    if (!window.rvlcAppearance) return;
    try {
      if (await window.rvlcAppearance(window.rvlcSession, theme)) return;
    } catch {
      // The selected colors remain visible for this session.
    }
    if (document.documentElement.dataset.theme === theme) {
      displayStatus("Não foi possível guardar sua preferência de tema.", "error");
    }
  }

  function renderHistory(history) {
    const list = byId("history-list");
    list.replaceChildren();
    if (!history.length) {
      list.append(node("p", "Seus ajustes de captura e limpeza aparecerão aqui.", "empty"));
      return;
    }
    for (const item of history) {
      const row = node("div", "", "history-row"), summary = node("div");
      const date = new Date(item.at);
      const remaining = item.count ? ` · ${item.count} na quarentena` : "";
      summary.append(node("h3", names[item.kind] ?? "Alteração"),
        node("p", (Number.isNaN(date.valueOf()) ? "Data indisponível" : formatDay.format(date)) + remaining));
      row.append(summary, node("span", states[item.state] ?? "Indisponível"));
      list.append(row);
    }
  }

  function renderPower(next) {
    power = next;
    const plans = next.plans ?? [];
    if (next.selected) selectedPlan = next.selected;
    if (!plans.some((p) => p.id === selectedPlan)) selectedPlan = plans.find((plan) => plan.id === next.active)?.id ?? plans[0]?.id ?? "";
    planList.replaceChildren(node("legend", "Selecione um plano de energia", "visually-hidden"));
    if (next.error) planList.append(node("p", next.error, "empty"));
    else if (!plans.length) planList.append(node("p", "Nenhum plano disponível para seleção.", "empty"));
    for (const plan of plans) {
      const label = node("label", "", "plan-option");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "selected-plan";
      radio.value = plan.id;
      radio.checked = selectedPlan === plan.id;
      const meta = node("div");
      meta.append(node("strong", plan.name));
      if (plan.description) meta.append(node("p", plan.description));
      label.append(radio, meta);
      if (plan.id === next.active) label.append(node("span", "Ativo", "plan-active"));
      planList.append(label);
    }
  }

  function gigabytes(bytes) {
    return formatNumber.format(bytes / (1024 ** 3)) + " GB";
  }

  function adapterMemory(adapter) {
    if (adapter.dedicated > 512 * 1024 ** 2) return gigabytes(adapter.dedicated) + " de VRAM dedicada";
    if (adapter.shared > 0) return "Até " + gigabytes(adapter.shared) + " de memória compartilhada";
    return adapter.dedicated > 0 ? gigabytes(adapter.dedicated) + " de VRAM dedicada" : "";
  }

  function renderComponent() {
    const info = latestMetrics?.hardware;
    const gpu = info?.adapters?.[0];
    const components = {
      cpu: ["chip", info?.processor || "Processador", info?.logical ? info.logical + " processadores lógicos" : ""],
      gpu: ["gpu", gpu?.name || "Placa de vídeo", gpu ? adapterMemory(gpu) : ""],
      ram: ["ram", latestMetrics?.memory?.total ? gigabytes(latestMetrics.memory.total) + " de memória RAM" : "Memória RAM", "Memória física utilizável"],
      disk: [info?.diskType === "HDD" ? "vault" : "drive", info?.diskName || "Disco do Windows",
        [info?.diskType, latestMetrics?.diskLabel].filter(Boolean).join(" · ")]
    };
    const [model, name, detail] = components[selectedComponent];
    hero.dataset.variant = model;
    byId("model").setAttribute("aria-label", "Ilustração 3D de " + componentLabels[selectedComponent]);
    byId("model-name").textContent = name;
    byId("model-detail").textContent = detail || "Ilustração em 3D";
    document.querySelectorAll("[data-component]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.component === selectedComponent)));
    scene.setMode(model);
  }

  function renderInventory(metrics) {
    if (!metrics.hardware) return;
    const data = metrics.hardware;
    const memory = metrics.memory?.total;
    const disk = metrics.disk?.total;
    const key = JSON.stringify([data, memory, disk, metrics.diskLabel]);
    if (key === inventoryKey) return;
    inventoryKey = key;
    const rows = [
      ["Processador", [[data.processor || "Modelo indisponível", data.logical ? data.logical + " processadores lógicos" : ""]]],
      ["GPU", data.adapters?.length ? data.adapters.map((adapter) => [adapter.name, adapterMemory(adapter)]) : [["Modelo indisponível", ""]]],
      ["Memória", [[memory ? gigabytes(memory) + " utilizáveis" : "Capacidade indisponível", ""]]],
      ["Armazenamento", [[data.diskName || "Disco do Windows", [data.diskType, disk ? gigabytes(disk) : "", metrics.diskLabel].filter(Boolean).join(" · ")]]]
    ];
    const list = byId("inventory");
    list.replaceChildren();
    for (const [title, items] of rows) {
      const detail = node("dd");
      for (const [primary, secondary] of items) {
        detail.append(node("strong", primary));
        if (secondary) detail.append(node("span", secondary));
      }
      list.append(node("dt", title), detail);
    }
  }

  function renderRecommendations(metrics) {
    if (!metrics.hardware) return;
    const ideas = window.recommendHardware(metrics.hardware, metrics, history);
    const key = JSON.stringify(ideas);
    if (key === recommendationKey) return;
    recommendationKey = key;
    const list = byId("recommendation-list");
    list.replaceChildren();
    if (!ideas.length) {
      list.append(node("p", "Aguardando dados para indicar ajustes.", "empty"));
      return;
    }
    for (const idea of ideas) {
      const row = node("article", "", "recommendation");
      const tile = node("span", "", "tile mint");
      tile.append(icon(idea.icon));
      const info = node("div");
      const button = node("button", idea.label, "secondary");
      button.type = "button";
      if (idea.action) button.dataset.action = idea.action;
      if (idea.tab) button.dataset.tab = idea.tab;
      button.disabled = !!busy && !!idea.action;
      info.append(node("h3", idea.title), node("p", idea.detail), button);
      row.append(tile, info);
      list.append(row);
    }
  }

  function drawUsage() {
    const chart = byId("usage-chart");
    const width = chart.clientWidth, height = chart.clientHeight;
    if (!width || !height) return;
    const canvas = chart.getContext("2d");
    if (!canvas) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (chart.width !== Math.round(width * scale)) chart.width = Math.round(width * scale);
    if (chart.height !== Math.round(height * scale)) chart.height = Math.round(height * scale);
    canvas.setTransform(scale, 0, 0, scale, 0, 0);
    canvas.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const pad = 23, high = 9, low = height - 11, right = width - 6;
    canvas.font = "10px Segoe UI, sans-serif";
    canvas.strokeStyle = css.getPropertyValue("--line").trim();
    canvas.lineWidth = 1;
    canvas.fillStyle = css.getPropertyValue("--quiet").trim();
    for (const tick of [100, 75, 50, 25, 0]) {
      const y = low - tick / 100 * (low - high);
      canvas.beginPath();
      canvas.moveTo(pad, y);
      canvas.lineTo(right, y);
      canvas.stroke();
      if (tick % 50 === 0) canvas.fillText(tick, 1, y + 3);
    }
    if (history.length < 2) return;
    const now = history.at(-1).at;
    const duration = Math.max(12000, Math.min(60000, now - history[0].at));
    for (const [key, color] of [["cpu", "--accent"], ["ram", "--mint"]]) {
      let connected = false;
      canvas.strokeStyle = css.getPropertyValue(color).trim();
      canvas.lineWidth = 1.7;
      canvas.beginPath();
      for (const value of history) {
        if (!Number.isFinite(value[key])) {
          connected = false;
          continue;
        }
        const x = right - (now - value.at) / duration * (right - pad);
        const y = low - Math.min(100, Math.max(0, value[key])) / 100 * (low - high);
        if (connected) canvas.lineTo(x, y);
        else canvas.moveTo(x, y);
        connected = true;
      }
      canvas.stroke();
    }
  }

  function stageHistory(metrics) {
    if (!Number.isFinite(metrics.at) || metrics.at === history.at(-1)?.at) return;
    if (history.length && (metrics.at - history.at(-1).at > 6000 || metrics.at < history.at(-1).at)) history = [];
    const ram = metrics.memory;
    history.push({
      at: metrics.at, cpu: metrics.cpu,
      ram: ram?.total > 0 ? 100 * ram.used / ram.total : null
    });
    history = history.filter((sample) => metrics.at - sample.at <= 60000);
    byId("chart-status").textContent = history.length > 1 ? "" : "Coletando dados";
    drawUsage();
  }

  function analyzePC() {
    if (typeof window.rvlcMonitor !== "function") {
      displayStatus("Abra o executável Rvlc Tweaks para analisar este PC.", "error");
      return;
    }
    expectedInspection = (latestMetrics?.inspection || 0) + 1;
    inspectionRequestedAt = Date.now();
    inspectNext = true;
    heroButton.disabled = true;
    byId("monitor-state").textContent = "Analisando componentes…";
    renderHeroAction();
    refreshMonitor();
  }

  function renderHeroAction() {
    const tab = tabs[active];
    const label = expectedInspection !== null ? "Analisando PC…" : latestMetrics?.hardware ? "Reanalisar PC" : "Analisar PC";
    const text = tab.analyze ? label : tab.button;
    if (heroButton.textContent !== text) heroButton.replaceChildren(text, icon(tab.icon));
  }

  function stageMeter(id, value, text) {
    byId(id + "-value").textContent = text || "—";
    byId(id + "-meter").value = value || 0;
  }

  function renderMonitor(metrics) {
    const cpu = metrics?.cpu;
    stageMeter("cpu", cpu, Number.isFinite(cpu) ? Math.round(cpu) + "%" : "");
    for (const [id, value] of [["ram", metrics?.memory], ["disk", metrics?.disk]]) {
      const used = value?.used, total = value?.total;
      const valid = Number.isFinite(used) && Number.isFinite(total) && total > 0;
      const gib = (count) => formatNumber.format(count / (1024 ** 3));
      stageMeter(id, valid ? used / total * 100 : 0, valid ? `${gib(used)} / ${gib(total)} GB` : "");
    }
    byId("disk-title").textContent = metrics?.diskLabel ? `Disco do Windows (${metrics.diskLabel})` : "Disco do Windows";
    if (!metrics) return;
    latestMetrics = metrics;
    if (expectedInspection !== null && metrics.hardware && metrics.inspection >= expectedInspection) {
      expectedInspection = null;
      heroButton.disabled = false;
    }
    byId("monitor-state").textContent = expectedInspection !== null ? "Analisando componentes…" : "Atualização em tempo real";
    renderHeroAction();
    renderComponent();
    stageHistory(metrics);
    renderInventory(metrics);
    renderRecommendations(metrics);
  }

  async function refreshMonitor() {
    if (expectedInspection !== null && Date.now() - inspectionRequestedAt > 12000) {
      expectedInspection = null;
      inspectNext = false;
      if (active === "optimize") {
        renderHeroAction();
        updateButtons();
        displayStatus("O Windows ainda está verificando os componentes.", "error");
      }
    }
    if (monitorPending || typeof window.rvlcMonitor !== "function") return;
    monitorPending = true;
    try {
      const inspect = inspectNext;
      inspectNext = false;
      const metrics = await window.rvlcMonitor(window.rvlcSession, inspect);
      if (active === "optimize" && !document.hidden) renderMonitor(metrics);
    } catch {
      if (active === "optimize") byId("monitor-state").textContent = "Dados indisponíveis";
    } finally {
      monitorPending = false;
    }
  }

  function syncMonitor() {
    const visible = active === "optimize" && !document.hidden;
    if (!visible) {
      clearInterval(monitorTimer);
      monitorTimer = 0;
    } else if (!monitorTimer) {
      refreshMonitor();
      monitorTimer = window.setInterval(refreshMonitor, 1400);
    }
  }

  function renderServices(items) {
    services = items;
    const list = byId("service-list");
    list.replaceChildren();
    for (const item of items) {
      const [name, detail] = serviceNames[item.id] ?? [item.id, ""];
      const row = node("article", "", "action-row service-row");
      row.dataset.serviceState = item.state;
      const tile = node("span", "", "tile cyan");
      tile.append(icon("tools"));
      const text = node("div", "", "row-copy");
      text.append(node("h3", name), node("p", detail, "service-text"));
      text.append(node("p", `${serviceStates[item.state] ?? "Indisponível"} · Inicialização ${serviceStartups[item.startup] ?? "Indisponível"}`, "service-state"));
      const actions = node("div", "", "row-actions");
      const start = node("button", item.state === "running" ? "Configurar início" : "Iniciar", "secondary");
      start.type = "button";
      start.dataset.confirm = "service-change";
      start.dataset.serviceId = item.id;
      start.dataset.mode = "start";
      start.dataset.unavailable = String(item.state === "missing" || item.state === "pending" ||
        item.state === "paused" || (item.state === "running" && item.startup === "auto"));
      start.setAttribute("aria-label", `${start.textContent} ${name}`);
      actions.append(start);
      if (item.id === "sysmain") {
        const stop = node("button", "Parar", "danger-link");
        stop.type = "button";
        stop.dataset.confirm = "service-change";
        stop.dataset.serviceId = item.id;
        stop.dataset.mode = "stop";
        stop.dataset.unavailable = String(!item.canStop);
        stop.setAttribute("aria-label", "Parar SysMain");
        actions.append(stop);
      }
      row.append(tile, text, actions);
      list.append(row);
    }
  }

  function showResult(reply, completed) {
    if (reply && typeof reply.capture === "string") {
      snapshot = reply;
      byId("capture-state").textContent = captureLabels[reply.capture] ?? captureLabels.unknown;
      byId("old-history").hidden = !reply.legacy;
      renderHistory(reply.history ?? []);
    }
    if (reply?.power) renderPower(reply.power);
    if (reply?.services) renderServices(reply.services);
    updateButtons();
    const messages = { state: "", "plan-list": "Lista de planos atualizada." };
    const message = reply?.message || (messages[completed] ?? "Solicitação enviada ao Windows.");
    displayStatus(reply?.error ? `Não foi possível concluir. ${reply.error}` : message, reply?.error ? "error" : "ready", reply?.downloaded);
  }

  function finish(id, reply) {
    if (id !== lastRequest || !busy) return;
    clearTimeout(timer);
    const completed = busy;
    busy = "";
    showResult(reply, completed);
  }

  window.rvlcResult = finish;
  async function request(action, value = "") {
    if (busy) return;
    busy = action;
    updateButtons();
    displayStatus(actionLabels[action] || "Abrindo a opção solicitada…", "busy");
    const id = ++lastRequest;
    if (typeof window.rvlcNative !== "function") {
      finish(id, { error: "Abra o executável Rvlc Tweaks para aplicar ajustes." });
      return;
    }
    try {
      timer = setTimeout(() => displayStatus("O Windows ainda está processando a solicitação.", "busy"), 15000);
      if (!await window.rvlcNative(window.rvlcSession, action, value, id)) {
        finish(id, { error: "A interface não conseguiu enviar a solicitação." });
      }
    } catch {
      finish(id, { error: "A conexão com o aplicativo foi interrompida." });
    }
  }

  function ask(action, button) {
    let [title, detail, apply] = confirmation[action] ?? [];
    let value = "";
    const autoChoice = byId("service-auto-choice"), auto = byId("service-auto");
    autoChoice.hidden = true;
    auto.checked = false;
    if (action === "plan-apply") {
      const plan = power?.plans?.find((p) => p.id === selectedPlan);
      if (!plan) return;
      value = plan.id;
      title = "Aplicar o plano de energia?";
      detail = `O Windows usará o plano “${plan.name}”. Você poderá trocar de plano nesta aba.`;
      apply = "Aplicar plano";
    }
    if (action === "service-change") {
      const service = services.find((entry) => entry.id === button.dataset.serviceId);
      if (!service) return;
      const name = serviceNames[service.id][0];
      const mode = button.dataset.mode;
      value = service.id + ":" + mode;
      if (mode === "stop") {
        title = "Parar o SysMain?";
        detail = "O SysMain será parado nesta sessão. Você pode iniciá-lo por esta mesma aba.";
        apply = "Parar SysMain";
      } else {
        title = service.state === "running" ? `Configurar o início de ${name}?` : `Iniciar ${name}?`;
        detail = "O Windows pode pedir permissão de administrador para concluir.";
        apply = "Confirmar";
        autoChoice.hidden = service.startup === "auto";
        auto.checked = service.startup === "disabled" || service.state === "running";
      }
    }
    pendingConfirm = { action, value };
    byId("dialog-title").textContent = title;
    byId("dialog-detail").textContent = detail;
    byId("dialog-apply").textContent = apply;
    byId("dialog-apply").classList.toggle("destructive", value.endsWith(":stop"));
    dialog.returnValue = "cancel";
    dialog.showModal();
  }

  dialog.addEventListener("close", () => {
    const pending = pendingConfirm;
    pendingConfirm = null;
    if (dialog.returnValue !== "apply" || !pending) return;
    if (pending.action === "service-change" && pending.value.endsWith(":start") && byId("service-auto").checked) {
      pending.value += "-auto";
    }
    request(pending.action, pending.value);
  });
  byId("reset-model").addEventListener("click", scene.reset);
  byId("dismiss-status").addEventListener("click", () => { byId("status").hidden = true; });
  planList.addEventListener("change", (event) => {
    if (event.target.name !== "selected-plan") return;
    selectedPlan = event.target.value;
    updateButtons();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.tab) navigate(button.dataset.tab);
    if (button.hasAttribute("data-analyze")) analyzePC();
    if (Object.hasOwn(componentLabels, button.dataset.component)) {
      selectedComponent = button.dataset.component;
      renderComponent();
    }
    if (button.dataset.action) request(button.dataset.action);
    if (button.dataset.copy) copyProjectLink(button.dataset.copy);
    if (button.dataset.confirm) ask(button.dataset.confirm, button);
    if (button.dataset.themeChoice) chooseTheme(button.dataset.themeChoice);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) event.preventDefault();
  });
  for (const event of ["dragover", "drop"]) {
    window.addEventListener(event, (e) => e.preventDefault());
  }
  document.addEventListener("visibilitychange", syncMonitor);
  new ResizeObserver(drawUsage).observe(byId("usage-chart"));
  const header = document.querySelector(".masthead");
  const headerObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--header-offset", Math.ceil(header.getBoundingClientRect().height) + 10 + "px");
    scheduleNavIndicator();
  });
  headerObserver.observe(header);
  headerObserver.observe(nav);
  useTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  renderTab();
  request("state");
})();
