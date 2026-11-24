package main

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	powrProf        = windows.NewLazySystemDLL("powrprof.dll")
	powerEnumerate  = powrProf.NewProc("PowerEnumerate")
	powerReadName   = powrProf.NewProc("PowerReadFriendlyName")
	powerGetActive  = powrProf.NewProc("PowerGetActiveScheme")
	powerSetActive  = powrProf.NewProc("PowerSetActiveScheme")
	powerImport     = powrProf.NewProc("PowerImportPowerScheme")
	comdlg32        = windows.NewLazySystemDLL("comdlg32.dll")
	getOpenFileName = comdlg32.NewProc("GetOpenFileNameW")
	commDlgError    = comdlg32.NewProc("CommDlgExtendedError")
	shellExecuteEx  = windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteExW")
)

const accessScheme = 16

type powerPlan struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	guid        windows.GUID
}

type powerState struct {
	Plans    []powerPlan `json:"plans"`
	Active   string      `json:"active,omitempty"`
	Selected string      `json:"selected,omitempty"`
	Error    string      `json:"error,omitempty"`
}

var standardPlans = map[string]string{
	"{381B4222-F694-41F0-9685-FF5BB260DF2E}": "Ajusta desempenho e consumo conforme o uso.",
	"{A1841308-3541-4FAB-BC81-F71556F20B4A}": "Reduz o consumo para aumentar a autonomia.",
	"{8C5E7FDA-E8BF-4A96-9A85-A6E23A8C635C}": "Prioriza desempenho e pode aumentar consumo e temperatura.",
}

func planID(guid *windows.GUID) string {
	return fmt.Sprintf("{%08X-%04X-%04X-%02X%02X-%X}", guid.Data1, guid.Data2, guid.Data3,
		guid.Data4[0], guid.Data4[1], guid.Data4[2:])
}

func getActivePlan() (string, error) {
	if err := powerGetActive.Find(); err != nil {
		return "", err
	}
	var guid *windows.GUID
	code, _, _ := powerGetActive.Call(0, uintptr(unsafe.Pointer(&guid)))
	if code != 0 {
		return "", syscall.Errno(code)
	}
	if guid == nil {
		return "", errors.New("o Windows não retornou o plano ativo")
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(guid)))
	return planID(guid), nil
}

func planName(guid *windows.GUID) string {
	if powerReadName.Find() != nil {
		return planID(guid)
	}
	var size uint32
	code, _, _ := powerReadName.Call(0, uintptr(unsafe.Pointer(guid)), 0, 0, 0, uintptr(unsafe.Pointer(&size)))
	if (code != 0 && syscall.Errno(code) != windows.ERROR_MORE_DATA) || size < 2 || size > 65536 {
		return planID(guid)
	}
	name := make([]uint16, (size+1)/2)
	code, _, _ = powerReadName.Call(0, uintptr(unsafe.Pointer(guid)), 0, 0, uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&size)))
	if code == 0 {
		if value := strings.TrimSpace(windows.UTF16ToString(name)); value != "" {
			return value
		}
	}
	return planID(guid)
}

func readPowerState() powerState {
	state := powerState{Plans: []powerPlan{}}
	if powerEnumerate.Find() != nil {
		state.Error = "Não foi possível listar os planos de energia do Windows."
		return state
	}
	active, err := getActivePlan()
	if err != nil {
		state.Error = "O Windows não informou qual plano está ativo."
	} else {
		state.Active = active
	}
	for index := uint32(0); ; index++ {
		var guid windows.GUID
		size := uint32(unsafe.Sizeof(guid))
		code, _, _ := powerEnumerate.Call(0, 0, 0, accessScheme, uintptr(index), uintptr(unsafe.Pointer(&guid)), uintptr(unsafe.Pointer(&size)))
		if syscall.Errno(code) == windows.ERROR_NO_MORE_ITEMS {
			return state
		}
		if code != 0 || size != uint32(unsafe.Sizeof(guid)) {
			state.Error = "Não foi possível listar os planos de energia do Windows."
			return state
		}
		id := planID(&guid)
		state.Plans = append(state.Plans, powerPlan{ID: id, Name: planName(&guid), Description: standardPlans[id], guid: guid})
	}
}

func (a *optimizer) setPowerPlan(id string) (string, error) {
	if len(id) != 38 {
		return "", errors.New("selecione um plano instalado")
	}
	id = strings.ToUpper(id)
	current := readPowerState()
	for _, plan := range current.Plans {
		if plan.ID != id {
			continue
		}
		if current.Active == id {
			return fmt.Sprintf("O plano %s já está ativo.", plan.Name), nil
		}
		if err := powerSetActive.Find(); err != nil {
			return "", err
		}
		code, _, _ := powerSetActive.Call(0, uintptr(unsafe.Pointer(&plan.guid)))
		var err error
		if needsElevation(code) {
			err = a.elevatedPowercfg("-setactive", strings.Trim(id, "{}"))
		} else if code != 0 {
			err = syscall.Errno(code)
		}
		if err != nil {
			return "", err
		}
		active, err := getActivePlan()
		if err != nil || active != id {
			return "", errors.New("o Windows não confirmou o plano como ativo")
		}
		return fmt.Sprintf("Plano ativo: %s.", plan.Name), nil
	}
	return "", errors.New("o plano selecionado não está mais instalado")
}

func (a *optimizer) importPowerPlan(path string) (string, error) {
	if !filepath.IsAbs(path) || !strings.EqualFold(filepath.Ext(path), ".pow") {
		return "", errors.New("selecione um arquivo de plano com extensão .pow")
	}
	if err := checkType(path, false); err != nil {
		return "", err
	}
	filename, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	if err := powerImport.Find(); err != nil {
		return "", err
	}
	var imported *windows.GUID
	code, _, _ := powerImport.Call(0, uintptr(unsafe.Pointer(filename)), uintptr(unsafe.Pointer(&imported)))
	if imported != nil {
		defer windows.LocalFree(windows.Handle(unsafe.Pointer(imported)))
	}
	if needsElevation(code) {
		id, err := windows.GenerateGUID()
		if err != nil {
			return "", err
		}
		target := planID(&id)
		return target, a.elevatedPowercfg("-import", path, strings.Trim(target, "{}"))
	}
	if code != 0 {
		return "", fmt.Errorf("o Windows recusou a importação: %w", syscall.Errno(code))
	}
	if imported == nil {
		return "", errors.New("o Windows não identificou o plano importado")
	}
	return planID(imported), nil
}

func needsElevation(code uintptr) bool {
	return syscall.Errno(code) == windows.ERROR_ACCESS_DENIED || syscall.Errno(code) == windows.ERROR_PRIVILEGE_NOT_HELD
}

type shellExecution struct {
	Size       uint32
	Mask       uint32
	Owner      uintptr
	Verb       *uint16
	File       *uint16
	Parameters *uint16
	Directory  *uint16
	Show       int32
	Instance   uintptr
	IDList     uintptr
	Class      *uint16
	ClassKey   uintptr
	HotKey     uint32
	Icon       uintptr
	Process    windows.Handle
}

func (a *optimizer) elevatedPowercfg(args ...string) error {
	system, err := windows.GetSystemDirectory()
	if err != nil {
		return err
	}
	code, err := a.runElevated(filepath.Join(system, "powercfg.exe"), args...)
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("o Windows não concluiu a operação de energia (código %d)", code)
	}
	return nil
}

func (a *optimizer) runElevated(target string, args ...string) (uint32, error) {
	verb, _ := windows.UTF16PtrFromString("runas")
	file, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return 0, err
	}
	for i := range args {
		args[i] = windows.EscapeArg(args[i])
	}
	parameters, err := windows.UTF16PtrFromString(strings.Join(args, " "))
	if err != nil {
		return 0, err
	}
	info := shellExecution{
		Mask:  0x40 | 0x100, // Keep the process handle and require synchronous launch.
		Owner: a.owner, Verb: verb, File: file, Parameters: parameters,
	}
	info.Size = uint32(unsafe.Sizeof(info))
	ok, _, launchErr := shellExecuteEx.Call(uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return 0, launchErr
	}
	if info.Process == 0 {
		return 0, errors.New("o Windows não retornou o processo de alteração")
	}
	defer windows.CloseHandle(info.Process)
	event, err := windows.WaitForSingleObject(info.Process, 60000)
	if err != nil {
		return 0, err
	}
	if event != windows.WAIT_OBJECT_0 {
		return 0, errors.New("o Windows ainda não confirmou a operação. Atualize o status.")
	}
	var code uint32
	if err := windows.GetExitCodeProcess(info.Process, &code); err != nil {
		return 0, err
	}
	return code, nil
}

type fileDialog struct {
	Size          uint32
	Owner         uintptr
	Instance      uintptr
	Filter        *uint16
	CustomFilter  *uint16
	MaxCustom     uint32
	FilterIndex   uint32
	File          *uint16
	MaxFile       uint32
	FileTitle     *uint16
	MaxFileTitle  uint32
	InitialDir    *uint16
	Title         *uint16
	Flags         uint32
	FileOffset    uint16
	Extension     uint16
	DefaultExt    *uint16
	Data          uintptr
	Hook          uintptr
	Template      *uint16
	Reserved      uintptr
	ReservedWord  uint32
	ExtendedFlags uint32
}

func pickPowerFile(owner uintptr) (string, error) {
	filter := []uint16{}
	for _, item := range []string{"Planos de energia (*.pow)", "*.pow"} {
		value, _ := windows.UTF16FromString(item)
		filter = append(filter, value...)
	}
	filter = append(filter, 0)
	title, _ := windows.UTF16PtrFromString("Importar plano de energia")
	buffer := make([]uint16, 32768)
	dialog := fileDialog{
		Owner: owner, Filter: &filter[0], FilterIndex: 1, File: &buffer[0], MaxFile: uint32(len(buffer)), Title: title,
		Flags: 0x80000 | 0x800 | 0x1000 | 0x8, // Explorer, existing path and file, preserve the working directory.
	}
	dialog.Size = uint32(unsafe.Sizeof(dialog))
	ok, _, _ := getOpenFileName.Call(uintptr(unsafe.Pointer(&dialog)))
	if ok != 0 {
		return windows.UTF16ToString(buffer), nil
	}
	code, _, _ := commDlgError.Call()
	if code != 0 {
		return "", fmt.Errorf("não foi possível abrir o seletor de arquivos (código %d)", code)
	}
	return "", nil
}

func (a *optimizer) powerAction(action, value string) (state powerState, message string, err error) {
	var selected string
	switch action {
	case "plan-import":
		var path string
		path, err = pickPowerFile(a.owner)
		if err == nil && path != "" {
			selected, err = a.importPowerPlan(path)
			if err == nil {
				message = "Plano importado. Clique em Aplicar plano quando quiser ativá-lo."
			}
		} else if err == nil {
			message = "Importação cancelada."
		}
	case "plan-apply":
		message, err = a.setPowerPlan(value)
	}
	state = readPowerState()
	if selected != "" && err == nil {
		for _, plan := range state.Plans {
			if plan.ID == selected {
				state.Selected = selected
				return
			}
		}
		err = errors.New("o Windows não confirmou o plano importado na lista")
	}
	return
}
