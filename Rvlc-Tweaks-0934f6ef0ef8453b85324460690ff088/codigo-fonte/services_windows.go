package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var fivemServices = []string{"dps", "diagtrack", "pcasvc", "sysmain"}

type serviceInfo struct {
	ID      string `json:"id"`
	State   string `json:"state"`
	Startup string `json:"startup"`
	CanStop bool   `json:"canStop,omitempty"`
}

func serviceAllowed(id, mode string) bool {
	for _, candidate := range fivemServices {
		if candidate == id {
			return mode == "start" || mode == "start-auto" || (id == "sysmain" && mode == "stop")
		}
	}
	return false
}

func serviceStartup(handle windows.Handle) (uint32, error) {
	var size uint32
	if err := windows.QueryServiceConfig(handle, nil, 0, &size); !errors.Is(err, windows.ERROR_INSUFFICIENT_BUFFER) {
		return 0, err
	}
	if size < uint32(unsafe.Sizeof(windows.QUERY_SERVICE_CONFIG{})) {
		return 0, windows.ERROR_INVALID_DATA
	}
	buffer := make([]byte, size)
	value := (*windows.QUERY_SERVICE_CONFIG)(unsafe.Pointer(&buffer[0]))
	if err := windows.QueryServiceConfig(handle, value, size, &size); err != nil {
		return 0, err
	}
	return value.StartType, nil
}

func listServiceInfo() []serviceInfo {
	items := make([]serviceInfo, 0, len(fivemServices))
	manager, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err == nil {
		defer windows.CloseServiceHandle(manager)
	}
	for _, id := range fivemServices {
		info := serviceInfo{ID: id, State: "unknown", Startup: "unknown"}
		if err == nil {
			info = serviceOverview(manager, info)
		}
		items = append(items, info)
	}
	return items
}

func serviceOverview(manager windows.Handle, info serviceInfo) serviceInfo {
	name, _ := windows.UTF16PtrFromString(info.ID)
	statusHandle, err := windows.OpenService(manager, name, windows.SERVICE_QUERY_STATUS)
	if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) {
		info.State = "missing"
		return info
	}
	if err == nil {
		var status windows.SERVICE_STATUS
		if windows.QueryServiceStatus(statusHandle, &status) == nil {
			switch status.CurrentState {
			case windows.SERVICE_RUNNING:
				info.State = "running"
				info.CanStop = serviceAllowed(info.ID, "stop") && status.ControlsAccepted&windows.SERVICE_ACCEPT_STOP != 0
			case windows.SERVICE_STOPPED:
				info.State = "stopped"
			case windows.SERVICE_START_PENDING, windows.SERVICE_STOP_PENDING, windows.SERVICE_CONTINUE_PENDING, windows.SERVICE_PAUSE_PENDING:
				info.State = "pending"
			case windows.SERVICE_PAUSED:
				info.State = "paused"
			}
		}
		windows.CloseServiceHandle(statusHandle)
	}
	configHandle, err := windows.OpenService(manager, name, windows.SERVICE_QUERY_CONFIG)
	if err == nil {
		if start, err := serviceStartup(configHandle); err == nil {
			switch start {
			case windows.SERVICE_AUTO_START:
				info.Startup = "auto"
			case windows.SERVICE_DEMAND_START:
				info.Startup = "manual"
			case windows.SERVICE_DISABLED:
				info.Startup = "disabled"
			}
		}
		windows.CloseServiceHandle(configHandle)
	}
	return info
}

func changeService(id, mode string) error {
	if !serviceAllowed(id, mode) {
		return windows.ERROR_INVALID_PARAMETER
	}
	manager, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err != nil {
		return err
	}
	defer windows.CloseServiceHandle(manager)
	name, _ := windows.UTF16PtrFromString(id)
	access := uint32(windows.SERVICE_QUERY_STATUS)
	switch mode {
	case "stop":
		access |= windows.SERVICE_STOP
	case "start-auto":
		access |= windows.SERVICE_CHANGE_CONFIG | windows.SERVICE_QUERY_CONFIG | windows.SERVICE_START
	default:
		access |= windows.SERVICE_START
	}
	handle, err := windows.OpenService(manager, name, access)
	if err != nil {
		return err
	}
	defer windows.CloseServiceHandle(handle)

	if mode == "stop" {
		var status windows.SERVICE_STATUS
		if err := windows.ControlService(handle, windows.SERVICE_CONTROL_STOP, &status); err != nil && !errors.Is(err, windows.ERROR_SERVICE_NOT_ACTIVE) {
			return err
		}
		return waitForService(handle, windows.SERVICE_STOPPED)
	}

	var previous uint32
	var changed bool
	if mode == "start-auto" {
		previous, err = serviceStartup(handle)
		if err != nil {
			return err
		}
		if previous != windows.SERVICE_AUTO_START {
			if err := setServiceStartup(handle, windows.SERVICE_AUTO_START); err != nil {
				return err
			}
			changed = true
		}
	}
	err = windows.StartService(handle, 0, nil)
	if err != nil && !errors.Is(err, windows.ERROR_SERVICE_ALREADY_RUNNING) {
		if changed {
			_ = setServiceStartup(handle, previous)
		}
		return err
	}
	return waitForService(handle, windows.SERVICE_RUNNING)
}

func setServiceStartup(handle windows.Handle, startup uint32) error {
	return windows.ChangeServiceConfig(handle, windows.SERVICE_NO_CHANGE, startup, windows.SERVICE_NO_CHANGE,
		nil, nil, nil, nil, nil, nil, nil)
}

func waitForService(handle windows.Handle, wanted uint32) error {
	until := time.Now().Add(9 * time.Second)
	for {
		var status windows.SERVICE_STATUS
		if err := windows.QueryServiceStatus(handle, &status); err != nil {
			return err
		}
		if status.CurrentState == wanted {
			return nil
		}
		if wanted == windows.SERVICE_RUNNING && status.CurrentState == windows.SERVICE_STOPPED {
			if status.Win32ExitCode != 0 {
				return syscall.Errno(status.Win32ExitCode)
			}
			return windows.ERROR_SERVICE_NOT_ACTIVE
		}
		if time.Now().After(until) {
			return windows.ERROR_TIMEOUT
		}
		time.Sleep(150 * time.Millisecond)
	}
}

func (a *optimizer) serviceAction(value string) (string, error) {
	id, mode, ok := strings.Cut(value, ":")
	if !ok || !serviceAllowed(id, mode) {
		return "", errors.New("ação indisponível para este serviço")
	}
	err := changeService(id, mode)
	if errors.Is(err, windows.ERROR_ACCESS_DENIED) || errors.Is(err, windows.ERROR_PRIVILEGE_NOT_HELD) {
		path, pathErr := os.Executable()
		if pathErr != nil {
			return "", pathErr
		}
		code, launchErr := a.runElevated(path, "--service-control", id, mode)
		err = launchErr
		if err == nil && code != 0 {
			err = syscall.Errno(code)
		}
	}
	switch {
	case errors.Is(err, windows.ERROR_SERVICE_DISABLED):
		return "", errors.New("o serviço está desabilitado. Selecione inicialização automática para reativá-lo")
	case errors.Is(err, windows.ERROR_TIMEOUT):
		return "", errors.New("o Windows ainda não confirmou a mudança. Atualize o status do serviço")
	case err != nil:
		return "", err
	}
	switch mode {
	case "stop":
		return fmt.Sprintf("%s parado.", id), nil
	case "start-auto":
		return fmt.Sprintf("%s em execução, com inicialização automática.", id), nil
	default:
		return fmt.Sprintf("%s em execução.", id), nil
	}
}

func serviceHelperExitCode(id, mode string) int {
	err := changeService(id, mode)
	if err == nil {
		return 0
	}
	var code syscall.Errno
	if errors.As(err, &code) {
		return int(code)
	}
	return int(windows.ERROR_GEN_FAILURE)
}
