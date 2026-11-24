"use strict";

window.rvlcTutorial = (() => {
  const open = (label, action) => ({ label, action });
  const tab = (label, name) => ({ label, tab: name });
  const item = (title, text, ...links) => ({ title, text, links });
  const guided = (visual, route, task) => ({ ...task, visual, route });
  const restart = (title, summary) => ({
    title, summary, visual: "restart",
    route: ["Iniciar", "Energia", "Reiniciar"],
    items: [
      item("Salve seu trabalho", "Feche os jogos e salve os arquivos em uso. Conclua esta etapa no tutorial para deixar o próximo item salvo."),
      item("Reinicie pelo Windows", "No menu Iniciar, clique em Energia e escolha Reiniciar. Quando o Windows voltar, abra o Rvlc Tweaks e entre em Tutorial para continuar.")
    ]
  });

  return [
    {
      title: "Discord, tela e opções de jogo",
      summary: "Configure o essencial do Windows e da GPU antes de instalar os outros utilitários.",
      visual: "display",
      route: ["Configurações do Windows", "Sistema > Tela", "Tela avançada", "Taxa de atualização"],
      items: [
        guided("apps", ["Discord", "Download para Windows", "Downloads", "Instalar"], item("Instale o Discord", "Abra a página oficial, escolha a versão para Windows e execute o instalador que aparecer em Downloads. Depois, entre na sua conta.",
          open("Página do Discord", "t-discord"))),
        guided("display", ["Configurações do Windows", "Sistema > Tela", "Tela avançada", "Taxa de atualização"], item("Escolha os Hz do monitor", "Em Tela avançada, escolha o monitor e selecione a taxa de atualização que deseja usar. Se o atalho abrir Sistema > Tela, selecione Tela avançada para ver as opções.",
          open("Abrir Tela avançada", "t-display"), tab("Ir para Monitor", "monitor"))),
        guided("game", ["Configurações do Windows", "Jogos", "Xbox Game Bar / Modo de Jogo"], item("Confira Xbox Game Bar e Modo de Jogo", "No Windows, abra Configurações > Jogos. Em Xbox Game Bar, revise os atalhos e recursos que usa. Em Modo de Jogo, ative a opção se quiser usar o recurso para jogar.",
          open("Abrir Game Bar", "t-gamebar"), open("Abrir Modo de Jogo", "gamemode"))),
        guided("input", ["Rvlc Tweaks", "Mouse", "Configurações adicionais do mouse", "Opções do Ponteiro"], item("Ajuste a precisão do ponteiro", "Abra as Propriedades do Mouse e vá a Opções do Ponteiro. Desmarque Aprimorar precisão do ponteiro se preferir o movimento sem aceleração do Windows. Clique em Aplicar.",
          open("Abrir opções do mouse", "mouse"), tab("Ir para Mouse", "mouse"))),
        guided("gpu", ["Painel de Controle da NVIDIA", "Gerenciar configurações em 3D", "Configurações de programa"], item("Revise o desempenho 3D", "Com uma GPU NVIDIA, abra Painel de Controle da NVIDIA > Gerenciar configurações em 3D > Configurações de programa. Escolha o jogo e, se a opção existir, teste Preferir desempenho máximo no modo de gerenciamento de energia. Em Gráficos do Windows, você pode escolher a GPU de alto desempenho para o mesmo jogo.",
          open("Abrir Gráficos do Windows", "graphics"), tab("Ir para GPU NVIDIA", "gpu")))
      ]
    },
    {
      title: "Instale o NVCleanstall",
      summary: "Use o NVCleanstall quando precisar instalar um driver para sua GPU NVIDIA.",
      visual: "driver",
      route: ["TechPowerUp", "Downloads", "NVCleanstall", "Instalador"],
      items: [
        item("Confirme a GPU", "Na aba Otimização, clique em Analisar PC e procure uma GPU NVIDIA entre os componentes. Se o PC não tiver uma, avance para a próxima etapa.",
          tab("Analisar PC", "optimize")),
        item("Baixe no TechPowerUp", "Abra a página oficial e baixe o NVCleanstall. No utilitário, selecione um driver compatível com o modelo da GPU e a versão do Windows. Use a seleção recomendada se estiver em dúvida.",
          open("Página do NVCleanstall", "t-nvclean")),
        item("Conclua e confira a imagem", "Salve o que estiver aberto antes da instalação. A tela pode piscar durante a atualização do driver. Quando terminar, confira a resolução e os Hz em Tela avançada.",
          open("Abrir Tela avançada", "t-display"))
      ]
    },
    {
      title: "Configuração Realtek",
      summary: "Identifique se o Realtek que você quer ajustar é o de áudio ou o de rede.",
      visual: "audio",
      route: ["Gerenciador de Dispositivos", "Áudio ou Adaptadores de rede", "Realtek"],
      items: [
        item("Identifique o dispositivo", "Procure Realtek em Controladores de som, vídeo e jogos ou em Adaptadores de rede. Confira o nome inteiro antes de abrir as propriedades.",
          open("Gerenciador de Dispositivos", "devices")),
        item("Se for áudio", "Em Configurações > Sistema > Som, selecione a saída e a entrada que usa. Teste o som e o microfone. Se o fabricante tiver instalado o Realtek Audio Console, abra-o pelo menu Iniciar para conferir conectores e efeitos.",
          open("Abrir configurações de som", "t-sound")),
        item("Se for Ethernet", "Em Rede e Internet > Ethernet, confira se o cabo aparece como conectado. Em caso de velocidade limitada, confira cabo e roteador antes de mudar as opções avançadas do adaptador.",
          open("Abrir Ethernet", "t-ethernet"))
      ]
    },
    {
      title: "PowerShell com CTT WinUtil",
      summary: "Consulte as versões publicadas e as instruções do Chris Titus Tech.",
      visual: "terminal",
      route: ["Rvlc Tweaks", "PowerShell", "WinUtil", "GitHub"],
      items: [
        item("Abra a aba PowerShell", "No cartão Chris Titus Tech WinUtil, abra o GitHub para consultar a versão publicada e ler as instruções do projeto.",
          tab("Ir para PowerShell", "powershell")),
        item("Escolha as opções no WinUtil", "Com o WinUtil aberto, leia a descrição de cada opção antes de aplicar. Use o GitHub do cartão para consultar a documentação.",
          open("GitHub do WinUtil", "winutil"))
      ]
    },
    restart("Primeiro reinício", "Reinicie depois das primeiras configurações e instalações."),
    {
      title: "Modo de energia e plano Calypso",
      summary: "Escolha um plano disponível no seu Windows e confira o modo de energia quando o PC estiver na tomada.",
      visual: "battery",
      route: ["Rvlc Tweaks", "Planos de energia", "Selecionar plano", "Aplicar plano"],
      items: [
        item("Ajuste o modo de energia", "Em Sistema > Energia e bateria, procure Modo de energia. Na tomada, escolha Melhor desempenho quando precisar priorizar desempenho e essa opção estiver disponível.",
          open("Abrir opções de energia", "t-energy")),
        item("Selecione Calypso ou outro plano", "Na aba Planos de energia, selecione Calypso se ele já estiver instalado. Se você tiver o arquivo .pow, use Importar arquivo .pow. Confirme o nome e clique em Aplicar plano.",
          tab("Ir para Planos de energia", "power"))
      ],
      note: "A referência do Calypso ainda depende da foto ou do arquivo .pow. Você pode escolher um plano que já aparece na lista e voltar a esta etapa depois."
    },
    {
      title: "Optimizer",
      summary: "Abra a versão oficial do Optimizer que está na aba Otimização.",
      visual: "tools",
      route: ["Rvlc Tweaks", "Otimização", "Optimizer", "Baixar EXE"],
      items: [
        item("Baixe o arquivo oficial", "Na aba Otimização, localize o cartão Optimizer. Use Baixar EXE para salvar a versão indicada em Downloads ou GitHub para consultar o projeto.",
          tab("Ir para Otimização", "optimize"), open("Baixar Optimizer", "get-optimizer")),
        item("Revise o que vai alterar", "Abra o arquivo salvo e confira o efeito das opções que escolher. Se for aplicar mudanças no sistema, você pode criar um ponto de restauração antes.",
          open("Abrir Proteção do Sistema", "restore"))
      ]
    },
    restart("Reinício após o Optimizer", "Reinicie depois de aplicar no Optimizer os ajustes que escolheu."),
    {
      title: "Profile Inspector para RTX 3050",
      summary: "Confira se o computador tem uma RTX 3050 e encontre o perfil do jogo no driver NVIDIA.",
      visual: "gpu",
      route: ["Rvlc Tweaks", "GPU NVIDIA", "Profile Inspector", "Perfil por jogo"],
      items: [
        item("Confirme o modelo", "Em Otimização, use Analisar PC e confira se a placa aparece como GeForce RTX 3050. As versões para desktop e notebook podem ter configurações diferentes.",
          tab("Ver componentes do PC", "optimize")),
        item("Abra o Profile Inspector", "Na aba GPU NVIDIA, baixe o utilitário. No Profile Inspector, selecione o perfil do jogo no campo Profiles. Use a opção de exportar o perfil atual antes de importar um .nip ou mudar valores.",
          tab("Ir para GPU NVIDIA", "gpu"), open("Ver versões oficiais", "inspector")),
        item("Revise o perfil enviado", "RTX 30,40.nip aparece na lista abaixo do Profile Inspector. Esse arquivo altera o perfil base do driver. Confira as opções e exporte o perfil atual antes de decidir se quer importá-lo.",
          open("Baixar RTX 30,40.nip", "get-rtx-nip"))
      ],
      note: "O nome do arquivo indica as séries 30 e 40. O perfil base e o campo de GPU OpenGL devem ser conferidos para a sua placa e o driver instalado."
    },
    {
      title: "Prioridade High no MSI Utility",
      summary: "Encontre a linha da GPU NVIDIA antes de ajustar a prioridade de interrupção.",
      visual: "priority",
      route: ["GPU NVIDIA", "MSI Utility v3", "Linha da RTX 3050", "Interrupt priority"],
      items: [
        item("Consulte o MSI Utility v3", "Na aba GPU NVIDIA, o cartão MSI Utility v3 leva à publicação do autor. Confira a compatibilidade da ferramenta com a sua placa antes de usá-la.",
          tab("Ir para GPU NVIDIA", "gpu")),
        item("Confira a opção High", "Na linha da placa NVIDIA, escolha High na coluna Interrupt priority se o campo estiver disponível. Use Apply para confirmar o ajuste escolhido. Preserve os demais dispositivos e anote o valor anterior para poder voltar.")
      ]
    },
    {
      title: "Revisar o nvidia.reg",
      summary: "Confira quais chaves o arquivo altera antes de decidir se elas se aplicam ao seu PC.",
      visual: "file",
      route: ["Explorador de Arquivos", "nvidia.reg", "Abrir com", "Bloco de Notas"],
      items: [
        item("Abra o arquivo como texto", "Na aba GPU NVIDIA, baixe NVIDIA.reg. Em Downloads, clique com o botão direito no arquivo e escolha Editar ou Abrir com > Bloco de Notas.",
          tab("Ir para GPU NVIDIA", "gpu"), open("Baixar NVIDIA.reg", "get-nv-reg")),
        item("Confira as chaves e faça backup", "Compare as chaves com o material que acompanha o arquivo. Abra a Proteção do Sistema se quiser preparar um ponto de restauração antes de aplicar um ajuste revisado.",
          open("Abrir Proteção do Sistema", "restore"))
      ],
      note: "O arquivo altera chaves de energia e agendamento da GPU e inclui um endereço ao final. Revise o conteúdo e o formato antes de tentar importá-lo."
    },
    {
      title: "Revisar o optimizacao_nvidia.bat",
      summary: "Leia os comandos do BAT e confira se correspondem aos ajustes que você pretende fazer.",
      visual: "file",
      route: ["Explorador de Arquivos", "optimizacao_nvidia.bat", "Editar", "Bloco de Notas"],
      items: [
        item("Abra como texto", "Na aba GPU NVIDIA, baixe Optimizacao_da_NVIDIA.bat. Clique com o botão direito e use Editar no Bloco de Notas. No Windows 11, use Mostrar mais opções para localizar o comando.",
          tab("Ir para GPU NVIDIA", "gpu"), open("Baixar Optimizacao_da_NVIDIA.bat", "get-nv-bat")),
        item("Compare com a sua configuração", "Confira quais arquivos, serviços ou configurações os comandos alteram. Use Analisar PC para conferir o modelo de GPU e a versão do driver no Gerenciador de Dispositivos.",
          tab("Ver componentes do PC", "optimize"), open("Gerenciador de Dispositivos", "devices"))
      ],
      note: "O BAT usa WMIC e procura adaptadores PCI de vídeo. O filtro pode encontrar GPUs de outros fabricantes, inclusive em notebooks com duas placas."
    },
    {
      title: "WinRAR, VLC e ajustes Alienware",
      summary: "Instale os aplicativos e confira os recursos disponíveis para seu modelo Alienware.",
      visual: "tools",
      route: ["Suporte Dell", "Identificar o modelo", "Drivers e downloads", "Alienware Command Center"],
      items: [
        item("Baixe WinRAR e VLC", "Abra as páginas oficiais, escolha a versão para seu Windows e execute os instaladores em Downloads.",
          open("Página do WinRAR", "t-winrar"), open("Página do VLC", "t-vlc")),
        item("Identifique o modelo Alienware", "No Suporte Dell, procure o computador pelo modelo ou pela etiqueta de serviço. Em Drivers e downloads, veja qual versão do Alienware Command Center é oferecida para ele.",
          open("Abrir Suporte Dell", "t-dell")),
        item("Confira se há ajuste de tensão", "No Alienware Command Center, verifique os controles de Performance ou Overclocking do seu modelo. Se houver ajuste de tensão, consulte os limites da Dell para esse hardware. Guarde o perfil original antes de testar.")
      ]
    },
    restart("Reinício após os utilitários", "Reinicie depois de instalar os aplicativos e concluir os ajustes que escolheu."),
    {
      title: "Atualizações do Windows",
      summary: "Verifique atualizações do sistema e confirme o que ficou pendente.",
      visual: "update",
      route: ["Configurações", "Windows Update", "Verificar se há atualizações"],
      items: [
        item("Verifique atualizações", "Abra o Windows Update e clique em Verificar se há atualizações. Aguarde a instalação das atualizações que o Windows oferecer.",
          open("Abrir Windows Update", "t-update")),
        item("Confira o estado depois", "Se houver um reinício pendente, salve seu trabalho e use a opção exibida no Windows Update. Após voltar, abra o painel de novo para conferir se terminou.")
      ]
    },
    {
      title: "Serviços parados e limpeza",
      summary: "Reative os serviços que você escolheu e abra as opções de limpeza.",
      visual: "tools",
      route: ["Rvlc Tweaks", "CMD", "FiveM", "Iniciar serviço"],
      items: [
        item("Consulte os serviços", "Na aba CMD, clique em Atualizar status na seção FiveM. Abra Iniciar para o serviço parado que deseja reativar. A opção de inicialização automática aparece na confirmação quando disponível.",
          tab("Ir para CMD", "cmd")),
        item("Escolha o que limpar", "A aba Limpeza lista os arquivos enviados. Para selecionar temporários pelo Windows, abra o Sensor de Armazenamento e confira as categorias antes de limpar.",
          tab("Ir para Limpeza", "cleanup"), open("Abrir Sensor de Armazenamento", "storage")),
        item("Baixe a opção de limpeza da Microsoft", "Se quiser um aplicativo de limpeza separado, abra a página do Microsoft PC Manager na Microsoft Store.",
          open("Microsoft PC Manager", "t-pcmanager"))
      ]
    },
    {
      title: "Ajustes do Discord",
      summary: "Revise voz, overlay e aceleração de hardware e teste o Discord durante o jogo.",
      visual: "audio",
      route: ["Discord", "Configurações de usuário", "Voz e vídeo / Avançado"],
      items: [
        item("Teste voz e vídeo", "Clique na engrenagem do Discord > Voz e vídeo. Selecione o microfone e o fone corretos e faça o teste de microfone."),
        item("Revise o overlay e a aceleração", "Se o overlay atrapalhar, abra Overlay de jogo e teste desativá-lo para aquele jogo. Em Avançado, compare a aceleração de hardware ligada e desligada conforme o uso de vídeo e compartilhamento.")
      ]
    },
    {
      title: "Aplicativos, lojas e jogos",
      summary: "Instale pelas páginas oficiais. Depois, use a biblioteca da loja em que você tem cada jogo.",
      visual: "apps",
      route: ["Página oficial", "Instalar", "Entrar na conta", "Biblioteca"],
      items: [
        item("Spotify e OBS", "Instale o Spotify e o OBS Studio pelos sites oficiais.",
          open("Spotify", "t-spotify"), open("OBS Studio", "t-obs")),
        item("Steam e Epic Games", "Baixe os clientes das lojas de que você precisa e entre com a conta em que tem seus jogos.",
          open("Steam", "t-steam"), open("Epic Games", "t-epic")),
        item("GTA V, Rainbow Six Siege e VALORANT", "Instale GTA V e Rainbow Six Siege pela biblioteca da loja que tem sua licença. Para VALORANT, use o instalador oficial da Riot.",
          open("GTA V", "t-gta"), open("Rainbow Six Siege", "t-r6"), open("VALORANT", "t-valorant")),
        item("FiveM", "Instale e abra o GTA V conforme as instruções do FiveM. Depois baixe o cliente no site oficial e, se ele pedir, selecione a pasta correta do jogo.",
          open("FiveM", "t-fivem"))
      ]
    },
    {
      title: "Software de mouse e teclado",
      summary: "Identifique a marca e o modelo para instalar o software certo.",
      visual: "input",
      route: ["Modelo do periférico", "Suporte do fabricante", "Software", "Perfil"],
      items: [
        item("Confira a marca e o modelo", "Veja o nome com a etiqueta do periférico ou no Gerenciador de Dispositivos. Use o suporte da marca para localizar o software compatível com seu modelo.",
          open("Logitech", "t-logitech"), open("Razer", "t-razer"), open("Corsair", "t-corsair")),
        item("Crie o perfil", "No software oficial, revise DPI, taxa de resposta e layout do teclado. Salve um perfil que você consiga identificar e confira a precisão do ponteiro no Windows.",
          open("Abrir opções do mouse", "mouse"))
      ]
    },
    {
      title: "CPU-Z",
      summary: "Use o CPU-Z para conferir o processador e a memória.",
      visual: "chip",
      route: ["CPUID", "CPU-Z", "CPU", "Memory e SPD"],
      items: [
        item("Baixe pelo CPUID", "Abra a página oficial do CPU-Z. Escolha a versão para o seu Windows e abra o utilitário.",
          open("Página do CPU-Z", "t-cpuz")),
        item("Confira as abas", "Em CPU, veja o nome do processador. Em Memory, confira a memória detectada. Em SPD, selecione cada slot para ver as informações que a placa-mãe disponibiliza.",
          tab("Ver componentes detectados", "optimize"))
      ]
    },
    {
      title: "Configurações dos jogos no Drive",
      summary: "Use suas referências para ajustar os menus de vídeo, gráfico e controle.",
      visual: "folder",
      route: ["Google Drive", "Pasta de referências", "Jogo", "Configurações"],
      items: [
        item("Abra sua pasta do Drive", "Abra o Google Drive e localize as fotos ou presets do jogo certo. Confira a resolução e o monitor anotados na referência.",
          open("Abrir Meu Drive", "t-drive")),
        item("Ajuste dentro do jogo", "Abra as configurações do jogo. Compare as opções da referência com as opções que aparecem na sua versão. Teste a imagem e a resposta do mouse antes de salvar.")
      ],
      note: "O link da pasta e os valores das referências ainda precisam ser fornecidos para aparecerem aqui."
    },
    {
      title: "FiveM, sensibilidade e modo Beta",
      summary: "Use as referências de sensibilidade −46, proporção 5:3 e canal Beta que você anotou.",
      visual: "game",
      route: ["FiveM", "Configurações do jogo", "Mouse e gráficos", "Canal de atualização"],
      items: [
        item("Confira sensibilidade e proporção", "No jogo, abra os menus de Mouse e Teclado e de Gráficos. Use −46 no controle identificado na sua captura e escolha 5:3 se essa proporção estiver disponível. Depois teste o movimento do mouse e se a imagem fica estável."),
        item("Confira o canal Beta", "No menu principal do FiveM, abra as configurações e procure Canal de atualização ou Update channel. Se Beta aparecer, selecione e reabra o FiveM para conferir.",
          open("Site oficial do FiveM", "t-fivem"))
      ],
      note: "A imagem da configuração vai indicar em qual controle aplicar −46."
    },
    {
      title: "Coleção de fotos das configurações",
      summary: "Guarde as telas finais de R6, VALORANT e FiveM para consultar depois.",
      visual: "camera",
      route: ["Win + Shift + S", "Capturar a tela", "Salvar", "R6 / Valorant / FiveM"],
      items: [
        item("Capture os ajustes dos três jogos", "No menu de configurações de cada jogo, use Win + Shift + S. Abra a notificação da captura e salve uma imagem por tela relevante, como Vídeo, Gráficos e Mouse."),
        item("Organize por jogo", "Abra a pasta de capturas e salve nas subpastas R6, Valorant e FiveM. Use nomes como video.png ou sensibilidade.png para identificar cada tela.",
          open("Abrir pasta de capturas", "tutorial-pictures"))
      ]
    }
  ];
})();
