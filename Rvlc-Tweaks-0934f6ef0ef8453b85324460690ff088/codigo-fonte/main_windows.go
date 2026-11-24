package main

import (
	"crypto/rand"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"

	webview "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

//go:embed ui/*
var assets embed.FS

const appName = "Rvlc Tweaks"

var (
	user32         = windows.NewLazySystemDLL("user32.dll")
	messageBox     = user32.NewProc("MessageBoxW")
	findWindow     = user32.NewProc("FindWindowW")
	showWindow     = user32.NewProc("ShowWindow")
	foreground     = user32.NewProc("SetForegroundWindow")
	dwm            = windows.NewLazySystemDLL("dwmapi.dll")
	setAttribute   = dwm.NewProc("DwmSetWindowAttribute")
	screenMetric   = user32.NewProc("GetSystemMetrics")
	ole            = windows.NewLazySystemDLL("ole32.dll")
	coInitialize   = ole.NewProc("CoInitializeEx")
	coUninitialize = ole.NewProc("CoUninitialize")
	dllDirectories = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetDefaultDllDirectories")
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--service-control" {
		if len(os.Args) != 4 {
			os.Exit(int(windows.ERROR_INVALID_PARAMETER))
		}
		os.Exit(serviceHelperExitCode(os.Args[2], os.Args[3]))
	}
	runtime.LockOSThread()
	if err := run(); err != nil {
		nativeMessage(err.Error(), 0x10)
	}
}

func run() error {
	if dllDirectories.Find() == nil {
		dllDirectories.Call(0x800) // LOAD_LIBRARY_SEARCH_SYSTEM32
	}
	hr, _, _ := coInitialize.Call(0, 2) // COINIT_APARTMENTTHREADED
	if int32(hr) < 0 {
		return fmt.Errorf("Não foi possível inicializar a janela do Windows (0x%08x).", uint32(hr))
	}
	defer coUninitialize.Call()
	name, _ := windows.UTF16PtrFromString("Local\\RvlcTweaks-Desktop")
	mutex, createErr := windows.CreateMutex(nil, false, name)
	if mutex == 0 {
		return fmt.Errorf("Não foi possível iniciar o %s: %w", appName, createErr)
	}
	defer windows.CloseHandle(mutex)
	if errors.Is(createErr, windows.ERROR_ALREADY_EXISTS) {
		title, _ := windows.UTF16PtrFromString(appName)
		if hwnd, _, _ := findWindow.Call(0, uintptr(unsafe.Pointer(title))); hwnd != 0 {
			showWindow.Call(hwnd, 9)
			foreground.Call(hwnd)
		}
		return nil
	}

	local, err := windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
	if err != nil {
		return fmt.Errorf("Não foi possível localizar a pasta do seu usuário: %w", err)
	}
	app := &optimizer{local: local, data: filepath.Join(local, appName)}
	if err := ensureDirectory(app.data); err != nil {
		return fmt.Errorf("Não foi possível preparar a pasta do aplicativo: %w", err)
	}
	webData := filepath.Join(app.data, "Interface")
	if err := ensureDirectory(webData); err != nil {
		return fmt.Errorf("Não foi possível preparar os dados da interface: %w", err)
	}
	if version, err := webviewloader.GetInstalledVersion(); err != nil || version == "" {
		if nativeMessage("O ambiente de interface Microsoft Edge WebView2 não está disponível. Abrir a página oficial de instalação?", 0x24) == 6 {
			return shell("open", "https://developer.microsoft.com/microsoft-edge/webview2/", "")
		}
		return nil
	}
	width, _, _ := screenMetric.Call(0)
	height, _, _ := screenMetric.Call(1)
	width, height = min(1280, width*95/100), min(900, height*92/100)
	view := webview.NewWithOptions(webview.WebViewOptions{
		DataPath:      webData,
		AutoFocus:     true,
		WindowOptions: webview.WindowOptions{Title: appName, Width: uint(width), Height: uint(height), IconId: 2, Center: true},
	})
	if view == nil {
		return errors.New("Não foi possível abrir a janela do Rvlc Tweaks. Feche o aplicativo e tente novamente.")
	}
	defer view.Destroy()
	app.owner = uintptr(view.Window())
	theme := appearance(app.data)
	setWindowTheme(view.Window(), theme)
	view.SetSize(720, 510, webview.HintMin)

	secrets := make([]byte, 56)
	if _, err := rand.Read(secrets); err != nil {
		return err
	}
	key := hex.EncodeToString(secrets[:32])
	nonce := base64.StdEncoding.EncodeToString(secrets[32:])
	view.Init(fmt.Sprintf(`if (location.href === "about:blank") Object.defineProperty(window, "rvlcSession", { value: %q });`, key))

	actions := make(chan request, 1)
	done := make(chan struct{})
	defer close(done)
	monitor := newSystemMonitor()
	go monitor.run(done)
	go func() {
		for {
			select {
			case req := <-actions:
				result := app.perform(req.Action, req.Value)
				select {
				case <-done:
					return
				default:
					reply, _ := json.Marshal(result)
					view.Dispatch(func() {
						view.Eval(fmt.Sprintf("window.rvlcResult(%d, %s)", req.ID, reply))
					})
				}
			case <-done:
				return
			}
		}
	}()
	err = view.Bind("rvlcNative", func(session, action, value string, id int) bool {
		if session != key || id < 1 || len(action) > 24 || len(value) > 64 {
			return false
		}
		select {
		case actions <- request{ID: id, Action: action, Value: value}:
			return true
		default:
			return false
		}
	})
	if err != nil {
		return err
	}
	if err := view.Bind("rvlcMonitor", func(session string, inspect bool) *systemMetrics {
		if session != key {
			return nil
		}
		return monitor.latest(inspect)
	}); err != nil {
		return err
	}
	if err := view.Bind("rvlcCopy", func(session, projectID string) bool {
		return session == key && copyProjectURL(app.owner, projectID)
	}); err != nil {
		return err
	}
	if err := view.Bind("rvlcAppearance", func(session, theme string) bool {
		if session != key || (theme != "light" && theme != "dark") {
			return false
		}
		setWindowTheme(view.Window(), theme)
		return saveAppearance(app.data, theme) == nil
	}); err != nil {
		return err
	}
	if err := view.Bind("rvlcSaveTutorial", func(session string, step int, done uint32) bool {
		return session == key && saveTutorialProgress(app.data, tutorialProgress{Step: step, Done: done})
	}); err != nil {
		return err
	}
	view.SetHtml(document(theme, loadTutorialProgress(app.data), nonce))
	view.Run()
	return nil
}

type request struct {
	ID     int
	Action string
	Value  string
}

func document(theme string, saved tutorialProgress, nonce string) string {
	progress, _ := json.Marshal(saved)
	read := func(name string) string {
		data, err := assets.ReadFile("ui/" + name)
		if err != nil {
			panic(err)
		}
		return string(data)
	}
	script := func(name string) string {
		return "<script nonce=\"" + nonce + "\">" + read(name) + "</script>"
	}
	return strings.NewReplacer(
		"<!-- STYLE -->", "<style>"+read("app.css")+read("icons.css")+"</style>",
		"<!-- DEPTH -->", script("depth.js"),
		"<!-- SCENE -->", script("scene.js"),
		"<!-- ANALYSIS -->", script("analysis.js"),
		"<!-- TUTORIAL DATA -->", script("tutorial-data.js"),
		"<!-- TUTORIAL -->", script("tutorial.js"),
		"<!-- APP -->", script("app.js"),
		"__SCRIPT_NONCE__", nonce,
		"__THEME__", theme,
		"__TUTORIAL_PROGRESS__", html.EscapeString(string(progress)),
		"__WINUTIL_URL__", html.EscapeString(winutilURL),
		"__DEBLOATER_URL__", html.EscapeString(debloaterURL),
		"__LOGO__", base64.StdEncoding.EncodeToString([]byte(read("logo.png"))),
		"__CODE_TEXTURE__", base64.StdEncoding.EncodeToString([]byte(read("code-texture.png"))),
	).Replace(read("index.html"))
}

func nativeMessage(message string, flags uintptr) uintptr {
	caption, _ := windows.UTF16PtrFromString(appName)
	content, _ := windows.UTF16PtrFromString(message)
	result, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(content)), uintptr(unsafe.Pointer(caption)), flags)
	return result
}

func appearance(data string) string {
	const file = "tema.txt"
	if raw, legacy, err := readPrivateFile(filepath.Join(data, file), 8); err == nil {
		if theme := strings.TrimSpace(string(raw)); theme == "light" || theme == "dark" {
			if legacy {
				_ = saveAppearance(data, theme)
			}
			return theme
		}
	}
	const pathPersonalize = `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`
	if key, err := registry.OpenKey(registry.CURRENT_USER, pathPersonalize, registry.QUERY_VALUE); err == nil {
		defer key.Close()
		if mode, _, err := key.GetIntegerValue("AppsUseLightTheme"); err == nil && mode == 1 {
			return "light"
		}
	}
	return "dark"
}

func saveAppearance(data, theme string) error {
	return writePrivateFile(data, "tema.txt", []byte(theme))
}

func setWindowTheme(window unsafe.Pointer, theme string) {
	if setAttribute.Find() != nil {
		return
	}
	var dark uint32
	if theme == "dark" {
		dark = 1
	}
	setAttribute.Call(uintptr(window), 20, uintptr(unsafe.Pointer(&dark)), 4)
}

func shell(verb, target, arguments string) error {
	verbPtr, _ := windows.UTF16PtrFromString(verb)
	targetPtr, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	var argumentsPtr *uint16
	if arguments != "" {
		argumentsPtr, err = windows.UTF16PtrFromString(arguments)
		if err != nil {
			return err
		}
	}
	return windows.ShellExecute(0, verbPtr, targetPtr, argumentsPtr, nil, windows.SW_SHOWNORMAL)
}

func ensureDirectory(path string) error {
	if err := os.Mkdir(path, 0700); err != nil && !errors.Is(err, os.ErrExist) {
		return err
	}
	return checkType(path, true)
}

func checkType(path string, directory bool) error {
	ptr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	flags, err := windows.GetFileAttributes(ptr)
	if err != nil {
		return err
	}
	if flags&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 ||
		(flags&windows.FILE_ATTRIBUTE_DIRECTORY != 0) != directory {
		return fmt.Errorf("tipo de arquivo inesperado em %s", filepath.Base(path))
	}
	return nil
}
