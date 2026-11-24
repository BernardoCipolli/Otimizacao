
| **PowerShell** | Consulte ou copie os links oficiais do WinUtil e do Windows10Debloater, que é um projeto arquivado. |
| **CMD** | Consulte DPS, DiagTrack, PcaSvc e SysMain. A seção permite iniciar os serviços listados e também parar o SysMain. |
| **Histórico** | Consulte as alterações registradas e desfaça as operações que o aplicativo oferece para reversão. |

O botão ao lado de cada modelo 3D restaura a vista inicial. O movimento dos modelos e do fundo acompanha a configuração de movimento reduzido do Windows.

## Segurança e dados locais

- **Assinatura digital.** A versão atual está sem assinatura Authenticode. A assinatura oficial depende de um certificado de assinatura de código ou de um serviço autorizado.
- **Permissões.** O aplicativo abre com os privilégios do usuário. Se uma operação de sistema exigir elevação, o Windows solicita a confirmação.
- **Downloads.** O Optimizer 17.0 vem do GitHub via HTTPS, com verificação de tamanho e SHA-256. O aplicativo salva os arquivos em Downloads e registra a marca de origem do Windows quando a pasta oferece suporte.
- **Scripts de limpeza.** `ResetCacheSystem.bat` e `1._Limpar_Arquivos_de_Lixo.bat` são distribuídos com o conteúdo original. Se executados manualmente, eles podem apagar logs, relatórios de diagnóstico e, no caso de `1._Limpar_Arquivos_de_Lixo.bat`, esvaziar a Lixeira. Leia os scripts antes de usá-los.
- **Preferências e histórico.** O tema, o progresso do tutorial e o histórico ficam em `%LOCALAPPDATA%\Rvlc Tweaks`, criptografados com a proteção de dados da conta do Windows (DPAPI). Use a mesma conta para acessar os dados protegidos.

## Compilar a partir do código-fonte

O projeto usa Go e uma interface HTML, CSS e JavaScript incorporada ao executável por meio do WebView2. Instale o **Go 1.27.4 ou superior** para Windows AMD64 e execute o comando abaixo na pasta que contém o `go.mod`.

```powershell
go build -buildvcs=false -trimpath -ldflags="-H windowsgui -s -w" -o Rvlc-Tweaks.exe .
```

Se alterar o ícone ou o manifesto do Windows, regenere o recurso antes de recompilar.

```powershell
go run github.com/akavel/rsrc@v0.10.2 -arch amd64 -ico app.ico -manifest app.manifest -o app_windows_amd64.syso
```

## Projetos e ferramentas de terceiros

- **Chris Titus Tech WinUtil.** [Repositório oficial](https://github.com/ChrisTitusTech/winutil)
- **Windows10Debloater**, de Sycnex. [Repositório arquivado](https://github.com/Sycnex/Windows10Debloater)
- **Optimizer**, de hellzerg. [Publicação 17.0](https://github.com/hellzerg/optimizer/releases/tag/17.0)
- **NVIDIA Profile Inspector**, de Orbmu2k. [Publicação 2.3.0.12](https://github.com/Orbmu2k/nvidiaProfileInspector/releases/tag/2.3.0.12)
- **MSI Utility v3.** [Publicação no fórum Guru3D](https://forums.guru3d.com/threads/windows-line-based-vs-message-signaled-based-interrupts-msi-tool.378044/)

O pacote de distribuição inclui as licenças dos componentes redistribuídos.
