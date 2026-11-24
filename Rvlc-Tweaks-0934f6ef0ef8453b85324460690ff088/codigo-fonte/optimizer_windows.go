package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type optimizer struct {
	local   string
	data    string
	preview []tempFile
	owner   uintptr
}

type tempFile struct {
	Relative string `json:"relative"`
	Key      string `json:"key"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"`
}

type backupValue struct {
	Set  bool   `json:"set"`
	Data uint32 `json:"data"`
}

type entry struct {
	Kind   string        `json:"kind"`
	State  string        `json:"state"`
	At     time.Time     `json:"at"`
	Values []backupValue `json:"values,omitempty"`
	Files  []tempFile    `json:"files,omitempty"`
}

type historyItem struct {
	Kind  string    `json:"kind"`
	State string    `json:"state"`
	At    time.Time `json:"at"`
	Count int       `json:"count"`
}

type result struct {
	Error      string        `json:"error,omitempty"`
	Message    string        `json:"message,omitempty"`
	Capture    string        `json:"capture"`
	History    []historyItem `json:"history"`
	Vault      int           `json:"vault"`
	Undo       string        `json:"undo,omitempty"`
	Legacy     bool          `json:"legacy"`
	Scan       *scanResult   `json:"scan,omitempty"`
	Power      *powerState   `json:"power,omitempty"`
	Downloaded bool          `json:"downloaded,omitempty"`
	Services   []serviceInfo `json:"services,omitempty"`
}

type scanResult struct {
	Count int   `json:"count"`
	Bytes int64 `json:"bytes"`
	Limit bool  `json:"limit"`
}

var captureKeys = []struct{ path, name string }{
	{`Software\Microsoft\Windows\CurrentVersion\GameDVR`, "AppCaptureEnabled"},
	{`System\GameConfigStore`, "GameDVR_Enabled"},
}

func capture() ([]backupValue, error) {
	values := make([]backupValue, len(captureKeys))
	for i, item := range captureKeys {
		key, err := registry.OpenKey(registry.CURRENT_USER, item.path, registry.QUERY_VALUE)
		if errors.Is(err, registry.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		value, kind, err := key.GetIntegerValue(item.name)
		key.Close()
		if errors.Is(err, registry.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if kind != registry.DWORD {
			return nil, errors.New("o Windows retornou um tipo inesperado para a configuração de captura")
		}
		values[i] = backupValue{Set: true, Data: uint32(value)}
	}
	return values, nil
}

func writeCapture(values []backupValue) error {
	var errs []error
	for i, item := range captureKeys {
		value := values[i]
		var key registry.Key
		var err error
		if value.Set {
			key, _, err = registry.CreateKey(registry.CURRENT_USER, item.path, registry.SET_VALUE)
		} else {
			key, err = registry.OpenKey(registry.CURRENT_USER, item.path, registry.SET_VALUE)
		}
		if err == nil {
			if value.Set {
				err = key.SetDWordValue(item.name, value.Data)
			} else {
				err = key.DeleteValue(item.name)
			}
			key.Close()
		}
		if err != nil && (value.Set || !errors.Is(err, registry.ErrNotExist)) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func captureDisabled(values []backupValue) bool {
	return len(values) == 2 && values[0] == (backupValue{Set: true}) && values[1] == (backupValue{Set: true})
}

const historyFile = "historico.json"

func (a *optimizer) history() ([]entry, error) {
	data, legacy, err := readPrivateFile(filepath.Join(a.data, historyFile), 32<<20)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var entries []entry
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&entries); err != nil {
		return nil, err
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return nil, errors.New("histórico contém dados inesperados")
	}
	for _, e := range entries {
		if e.Kind == "capture" && len(e.Values) != len(captureKeys) {
			return nil, errors.New("o histórico contém um backup de captura inválido")
		}
		for _, f := range e.Files {
			if !filepath.IsLocal(f.Relative) || !validKey(f.Key) {
				return nil, errors.New("o histórico contém um registro de arquivo inválido")
			}
		}
	}
	if legacy {
		_ = a.save(entries)
	}
	return entries, nil
}

func (a *optimizer) save(entries []entry) error {
	data, err := json.Marshal(entries)
	if err != nil {
		return err
	}
	return writePrivateFile(a.data, historyFile, data)
}

func move(from, to string, flags uint32) error {
	src, err := windows.UTF16PtrFromString(from)
	if err != nil {
		return err
	}
	dst, err := windows.UTF16PtrFromString(to)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(src, dst, flags)
}

func (a *optimizer) roots() (temp, vault string) {
	return filepath.Join(a.local, "Temp"), filepath.Join(a.data, "Quarentena")
}

func (a *optimizer) legacyPath() string {
	return filepath.Join(a.local, "PCOptimizerCentralV2")
}

func validKey(key string) bool {
	_, err := hex.DecodeString(key)
	return len(key) == 32 && err == nil
}

func safeTempPath(root, relative string, existing bool) (string, error) {
	if !filepath.IsLocal(relative) {
		return "", errors.New("caminho fora da pasta temporária")
	}
	path, file := filepath.Split(filepath.Clean(relative))
	current := root
	if err := checkType(current, true); err != nil {
		return "", err
	}
	for _, sub := range strings.Split(strings.TrimSuffix(path, string(filepath.Separator)), string(filepath.Separator)) {
		if sub != "" {
			current = filepath.Join(current, sub)
			if err := checkType(current, true); err != nil {
				return "", err
			}
		}
	}
	current = filepath.Join(current, file)
	if existing {
		return current, checkType(current, false)
	}
	return current, nil
}

func (a *optimizer) scan() (*scanResult, error) {
	a.preview = nil
	temp, _ := a.roots()
	summary := &scanResult{}
	if err := checkType(temp, true); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return summary, nil
		}
		return nil, err
	}
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	const maxFiles = 500
	var found []tempFile
	err := filepath.WalkDir(temp, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path == temp {
				return err
			}
			return nil
		}
		if d.IsDir() {
			if checkType(path, true) != nil {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() || checkType(path, false) != nil {
			return nil
		}
		info, err := d.Info()
		if err != nil || !info.ModTime().Before(cutoff) || info.Size() == 0 {
			return nil
		}
		if len(found) == maxFiles {
			summary.Limit = true
			return filepath.SkipAll
		}
		relative, err := filepath.Rel(temp, path)
		if err != nil || !filepath.IsLocal(relative) {
			return nil
		}
		id := make([]byte, 16)
		if _, err := rand.Read(id); err != nil {
			return err
		}
		found = append(found, tempFile{
			Relative: relative, Key: hex.EncodeToString(id), Size: info.Size(), Modified: info.ModTime().UnixNano(),
		})
		summary.Bytes += info.Size()
		return nil
	})
	if err != nil {
		return nil, err
	}
	a.preview = found
	summary.Count = len(found)
	return summary, nil
}

func (a *optimizer) applyClean(entries []entry) (string, error) {
	if len(a.preview) == 0 {
		return "", errors.New("Faça a análise de temporários primeiro.")
	}
	preview := a.preview
	a.preview = nil
	temp, vault := a.roots()
	if err := ensureDirectory(vault); err != nil {
		return "", err
	}
	entries = append(entries, entry{Kind: "clean", State: "pending", At: time.Now(), Files: preview})
	if err := a.save(entries); err != nil {
		return "", err
	}
	count := 0
	for _, f := range preview {
		from, err := safeTempPath(temp, f.Relative, true)
		if err != nil {
			continue
		}
		info, err := os.Lstat(from)
		if err != nil || !info.Mode().IsRegular() || info.Size() != f.Size || info.ModTime().UnixNano() != f.Modified {
			continue
		}
		if move(from, filepath.Join(vault, f.Key), windows.MOVEFILE_WRITE_THROUGH) == nil {
			count++
		}
	}
	entries[len(entries)-1].State = "applied"
	if count == 0 {
		entries = entries[:len(entries)-1]
	}
	err := a.save(entries)
	return fmt.Sprintf("%d arquivo(s) movido(s) para a quarentena. %d ignorado(s).", count, len(preview)-count), err
}

func (a *optimizer) applyCapture(entries []entry) (string, error) {
	values, err := capture()
	if err != nil {
		return "", err
	}
	if captureDisabled(values) {
		return "A captura já está desativada neste usuário.", nil
	}
	for _, e := range entries {
		if e.Kind == "capture" && e.State == "pending" {
			return "", errors.New("Há um ajuste incompleto. Desfaça-o no Histórico e tente novamente.")
		}
	}
	e := entry{Kind: "capture", State: "pending", At: time.Now(), Values: values}
	entries = append(entries, e)
	if err := a.save(entries); err != nil {
		return "", err
	}
	if err := writeCapture([]backupValue{{Set: true}, {Set: true}}); err != nil {
		if rollback := writeCapture(values); rollback != nil {
			return "", errors.Join(err, rollback)
		}
		return "", errors.Join(err, a.save(entries[:len(entries)-1]))
	}
	entries[len(entries)-1].State = "applied"
	return "Captura em segundo plano desativada. Você pode desfazer no Histórico.", a.save(entries)
}

func (a *optimizer) vaultCount(files []tempFile) int {
	_, vault := a.roots()
	if checkType(vault, true) != nil {
		return 0
	}
	count := 0
	for _, f := range files {
		if checkType(filepath.Join(vault, f.Key), false) == nil {
			count++
		}
	}
	return count
}

func (a *optimizer) latest(entries []entry) int {
	for i := len(entries) - 1; i >= 0; i-- {
		e := entries[i]
		if e.State == "undone" || e.State == "purged" {
			continue
		}
		if e.Kind == "capture" || (e.Kind == "clean" && a.vaultCount(e.Files) > 0) {
			return i
		}
	}
	return -1
}

func (a *optimizer) undo(entries []entry) (string, error) {
	i := a.latest(entries)
	if i == -1 {
		return "Nenhuma operação disponível para desfazer.", nil
	}
	e := &entries[i]
	if e.Kind == "capture" {
		current, err := capture()
		if err != nil {
			return "", err
		}
		for j, value := range current {
			if value != (backupValue{Set: true}) && value != e.Values[j] {
				return "", errors.New("A configuração de captura foi alterada fora do Rvlc Tweaks. Confira as opções do Windows antes de restaurar.")
			}
		}
		if err := writeCapture(e.Values); err != nil {
			return "", err
		}
		e.State = "undone"
		return "Configurações originais de captura restauradas.", a.save(entries)
	}
	temp, vault := a.roots()
	if err := checkType(vault, true); err != nil {
		return "", err
	}
	restored, remaining := 0, 0
	for _, f := range e.Files {
		from := filepath.Join(vault, f.Key)
		if checkType(from, false) != nil {
			continue
		}
		to, err := safeTempPath(temp, f.Relative, false)
		if err == nil && move(from, to, windows.MOVEFILE_WRITE_THROUGH) == nil {
			restored++
		} else {
			remaining++
		}
	}
	e.State = "undone"
	if remaining != 0 {
		e.State = "partial"
	}
	return fmt.Sprintf("%d arquivo(s) restaurado(s). %d continuam na quarentena.", restored, remaining), a.save(entries)
}

func (a *optimizer) purge(entries []entry) (string, error) {
	_, vault := a.roots()
	if err := checkType(vault, true); err != nil {
		return "", err
	}
	removed, failed := 0, 0
	for i := range entries {
		e := &entries[i]
		if e.Kind != "clean" || e.State == "undone" || e.State == "purged" {
			continue
		}
		count := a.vaultCount(e.Files)
		if count == 0 {
			continue
		}
		for _, f := range e.Files {
			path := filepath.Join(vault, f.Key)
			if checkType(path, false) != nil {
				continue
			}
			if err := os.Remove(path); err != nil {
				failed++
			} else {
				removed++
			}
		}
		if a.vaultCount(e.Files) == 0 {
			e.State = "purged"
		}
	}
	return fmt.Sprintf("%d arquivo(s) apagado(s) da quarentena. %d não puderam ser apagados.", removed, failed), a.save(entries)
}

var shortcuts = map[string]string{
	"graphics":  "ms-settings:display-advancedgraphics",
	"gamemode":  "ms-settings:gaming-gamemode",
	"captures":  "ms-settings:gaming-gamedvr",
	"storage":   "ms-settings:storagesense",
	"security":  "windowsdefender:",
	"inspector": "https://github.com/Orbmu2k/nvidiaProfileInspector/releases",
	"winutil":   winutilURL,
	"optimizer": "https://github.com/hellzerg/optimizer",
	"debloater": debloaterURL,
	"msi":       "https://forums.guru3d.com/threads/windows-line-based-vs-message-signaled-based-interrupts-msi-tool.378044/",
}

func (a *optimizer) perform(action, value string) result {
	r := result{History: []historyItem{}, Capture: "unknown"}
	entries, historyErr := a.history()
	var err error
	switch action {
	case "state":
		err = historyErr
		power := readPowerState()
		r.Power = &power
		r.Services = listServiceInfo()
	case "service-list":
		r.Services = listServiceInfo()
		r.Message = "Status dos serviços atualizado."
	case "service-change":
		r.Message, err = a.serviceAction(value)
		r.Services = listServiceInfo()
	case "plan-list", "plan-apply", "plan-import":
		var state powerState
		state, r.Message, err = a.powerAction(action, value)
		r.Power = &state
	case "get-nvidia", "get-optimizer",
		"get-rtx-nip", "get-gtx-nip", "get-performance-nip", "get-rvs-nip", "get-nv-reg", "get-nv-bat",
		"get-reset-cache", "get-cleanup-bat":
		r.Message, err = getDownload(action)
		r.Downloaded = err == nil
	case "tutorial-pictures":
		err = openTutorialPictures()
	case "t-display":
		r.Message, err = openAdvancedDisplay(windows.RtlGetVersion().BuildNumber, shell)
	case "downloads":
		var folder string
		folder, err = windows.KnownFolderPath(windows.FOLDERID_Downloads, 0)
		if err == nil {
			err = shell("open", folder, "")
		}
	case "scan":
		r.Scan, err = a.scan()
	case "clean", "capture", "undo", "purge":
		if historyErr != nil {
			err = errors.New("O histórico está indisponível. Nenhuma alteração foi iniciada.")
			break
		}
		switch action {
		case "clean":
			r.Message, err = a.applyClean(entries)
		case "capture":
			r.Message, err = a.applyCapture(entries)
		case "undo":
			r.Message, err = a.undo(entries)
		case "purge":
			r.Message, err = a.purge(entries)
		}
	case "vault":
		_, vault := a.roots()
		err = ensureDirectory(vault)
		if err == nil {
			err = shell("open", vault, "")
		}
	case "legacy":
		path := a.legacyPath()
		err = checkType(path, true)
		if err == nil {
			err = shell("open", path, "")
		}
	case "restore", "powershell", "devices", "mouse", "taskmgr":
		system, systemErr := windows.GetSystemDirectory()
		err = systemErr
		if err == nil {
			switch action {
			case "restore":
				err = shell("open", filepath.Join(system, "SystemPropertiesProtection.exe"), "")
			case "powershell":
				err = shell("open", filepath.Join(system, "WindowsPowerShell", "v1.0", "powershell.exe"), "-NoProfile")
			case "taskmgr":
				err = shell("open", filepath.Join(system, "Taskmgr.exe"), "")
			case "mouse":
				err = shell("open", filepath.Join(system, "control.exe"), "main.cpl")
			case "devices":
				err = shell("open", filepath.Join(system, "devmgmt.msc"), "")
			}
		}
	default:
		if target, ok := shortcuts[action]; ok {
			err = shell("open", target, "")
		} else if target, ok := tutorialShortcuts[action]; ok {
			err = shell("open", target, "")
		} else {
			err = errors.New("Ação desconhecida.")
		}
	}
	if errors.Is(err, windows.ERROR_CANCELLED) {
		r.Message = "Operação cancelada."
	} else if err != nil {
		r.Error = err.Error()
		log.Printf("%s: %v", action, err)
	}
	if values, err := capture(); err == nil {
		r.Capture = "available"
		if captureDisabled(values) {
			r.Capture = "disabled"
		}
	}
	entries, err = a.history()
	if err == nil {
		if i := a.latest(entries); i != -1 {
			r.Undo = entries[i].Kind
		}
		for i := len(entries) - 1; i >= 0; i-- {
			e := entries[i]
			item := historyItem{Kind: e.Kind, State: e.State, At: e.At}
			if e.Kind == "clean" {
				item.Count = a.vaultCount(e.Files)
				r.Vault += item.Count
			}
			r.History = append(r.History, item)
		}
	}
	r.Legacy = checkType(a.legacyPath(), true) == nil
	return r
}
