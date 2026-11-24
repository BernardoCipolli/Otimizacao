"use strict";

window.recommendHardware = function (hardware, metrics, history) {
  if (!hardware || !metrics) return [];
  const ideas = [];
  const gib = 1024 ** 3;
  const ram = metrics.memory;
  const disk = metrics.disk;
  const adapters = hardware.adapters ?? [];
  const options = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const quantity = (bytes) => options.format(bytes / gib) + " GB";
  const averageRecent = (key) => {
    const samples = history.slice(-6).map((sample) => sample[key]);
    return samples.length === 6 && samples.every(Number.isFinite)
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : null;
  };

  if (disk?.total > 0 && disk.used <= disk.total) {
    const free = disk.total - disk.used;
    if (free < 15 * gib || (free < 40 * gib && free / disk.total < .08)) {
      ideas.push({
        title: "Libere espaço no Windows", detail: `${quantity(free)} livres no disco do sistema.`,
        action: "storage", label: "Abrir armazenamento", icon: "box"
      });
    }
  }

  const ramLoad = averageRecent("ram");
  const cpuLoad = averageRecent("cpu");
  if (ramLoad !== null && ramLoad >= 85) {
    ideas.push({
      title: "Revise o uso de memória", detail: `A RAM ficou em ${Math.round(ramLoad)}% nas últimas leituras.`,
      action: "taskmgr", label: "Ver processos", icon: "grid"
    });
  } else if (ram?.total > 0 && ram.total <= 8 * gib) {
    ideas.push({
      title: "Reserve memória para o jogo", detail: `O Windows tem ${quantity(ram.total)} utilizáveis. Feche aplicativos que não pretende usar ao jogar.`,
      action: "taskmgr", label: "Ver processos", icon: "grid"
    });
  }

  if (adapters.length > 1) {
    ideas.push({
      title: "Escolha a GPU por jogo", detail: "Foram detectadas várias GPUs. No Windows, você pode indicar qual cada jogo deve usar.",
      action: "graphics", label: "Abrir gráficos", icon: "chip"
    });
  } else if (adapters.length === 1 && adapters[0].dedicated > 0 && adapters[0].dedicated <= 4 * gib) {
    ideas.push({
      title: "Comece com texturas mais leves", detail: `${quantity(adapters[0].dedicated)} de memória gráfica dedicada. Ajuste as texturas dentro do jogo e compare.`,
      action: "graphics", label: "Ver opções gráficas", icon: "chip"
    });
  } else if (adapters.some((adapter) => adapter.vendor === 0x10DE)) {
    ideas.push({
      title: "Ajustes por jogo na NVIDIA", detail: "Sua GPU NVIDIA permite revisar os perfis do driver por jogo.",
      tab: "gpu", label: "Abrir GPU NVIDIA", icon: "chip"
    });
  }

  if (cpuLoad !== null && cpuLoad >= 85 && !(ramLoad !== null && ramLoad >= 85)) {
    ideas.push({
      title: "Confira a carga do processador", detail: `A CPU ficou em ${Math.round(cpuLoad)}% nas últimas leituras. Confira quais apps estão consumindo mais CPU.`,
      action: "taskmgr", label: "Ver processos", icon: "chip"
    });
  }

  if (metrics.battery === true) {
    ideas.push({
      title: "Prefira equilíbrio na bateria", detail: "O PC está usando bateria. Um plano equilibrado pode reduzir o consumo.",
      tab: "power", label: "Ver planos de energia", icon: "bolt"
    });
  }

  if (ideas.length < 2 && (ram?.total || disk?.total || adapters.length || hardware.processor)) {
    ideas.push({
      title: "Confira o Modo de Jogo", detail: "Abra a configuração do Windows para revisar o modo dedicado a jogos.",
      action: "gamemode", label: "Abrir Modo de Jogo", icon: "game"
    });
  }
  return ideas.slice(0, 3);
};
