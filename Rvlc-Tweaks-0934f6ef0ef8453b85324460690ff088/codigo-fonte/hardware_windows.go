package main

import (
	"bytes"
	"encoding/binary"
	"runtime"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type graphicsAdapter struct {
	Name      string `json:"name"`
	Dedicated uint64 `json:"dedicated"`
	Shared    uint64 `json:"shared"`
	Vendor    uint32 `json:"vendor"`
}

type hardwareProfile struct {
	Processor string            `json:"processor,omitempty"`
	Logical   uint32            `json:"logical,omitempty"`
	Adapters  []graphicsAdapter `json:"adapters"`
	DiskType  string            `json:"diskType,omitempty"`
	DiskName  string            `json:"diskName,omitempty"`
}

var (
	makeDXGIFactory = windows.NewLazySystemDLL("dxgi.dll").NewProc("CreateDXGIFactory1")
	getPowerStatus  = metricsDLL.NewProc("GetSystemPowerStatus")
	dxgiFactoryID   = windows.GUID{Data1: 0x770AAE78, Data2: 0xF26F, Data3: 0x4DBA, Data4: [8]byte{0xA8, 0x29, 0x25, 0x3C, 0x83, 0xD1, 0xB3, 0x87}}
)

func inspectHardware(volume string) *hardwareProfile {
	result := &hardwareProfile{Logical: windows.GetActiveProcessorCount(0xffff)}
	if result.Logical == 0 {
		result.Logical = uint32(runtime.NumCPU())
	}
	path := `HARDWARE\DESCRIPTION\System\CentralProcessor\0`
	if key, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE); err == nil {
		if name, _, err := key.GetStringValue("ProcessorNameString"); err == nil {
			result.Processor = strings.Join(strings.Fields(name), " ")
		}
		key.Close()
	}
	result.Adapters = enumerateGraphics()
	result.DiskType, result.DiskName = inspectVolume(volume)
	return result
}

type dxgiDescription struct {
	Description                                   [128]uint16
	Vendor, Device, Subsystem, Revision           uint32
	DedicatedVideo, DedicatedSystem, SharedMemory uintptr
	LowID                                         uint32
	HighID                                        int32
	Flags                                         uint32
}

func enumerateGraphics() []graphicsAdapter {
	adapters := make([]graphicsAdapter, 0)
	if makeDXGIFactory.Find() != nil {
		return adapters
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	var factory *[1]*[14]uintptr
	status, _, _ := makeDXGIFactory.Call(uintptr(unsafe.Pointer(&dxgiFactoryID)), uintptr(unsafe.Pointer(&factory)))
	if int32(status) < 0 || factory == nil {
		return adapters
	}
	defer syscall.SyscallN(factory[0][2], uintptr(unsafe.Pointer(factory))) // IUnknown::Release
	for index := uintptr(0); ; index++ {
		var adapter *[1]*[11]uintptr
		status, _, _ := syscall.SyscallN(factory[0][12], uintptr(unsafe.Pointer(factory)), index, uintptr(unsafe.Pointer(&adapter)))
		if int32(status) < 0 || adapter == nil {
			break
		}
		var desc dxgiDescription
		status, _, _ = syscall.SyscallN(adapter[0][10], uintptr(unsafe.Pointer(adapter)), uintptr(unsafe.Pointer(&desc)))
		syscall.SyscallN(adapter[0][2], uintptr(unsafe.Pointer(adapter)))
		if int32(status) < 0 || desc.Flags&3 != 0 { // Software and remote adapters.
			continue
		}
		name := strings.TrimSpace(windows.UTF16ToString(desc.Description[:]))
		if name != "" {
			adapters = append(adapters, graphicsAdapter{Name: name, Dedicated: uint64(desc.DedicatedVideo), Shared: uint64(desc.SharedMemory), Vendor: desc.Vendor})
		}
	}
	return adapters
}

func inspectVolume(volume string) (kind, name string) {
	if len(volume) != 2 || volume[1] != ':' {
		return "", ""
	}
	path, err := windows.UTF16PtrFromString(`\\.\` + volume)
	if err != nil {
		return "", ""
	}
	handle, err := windows.CreateFile(path, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil, windows.OPEN_EXISTING, 0, 0)
	if err != nil {
		return "", ""
	}
	defer windows.CloseHandle(handle)

	const queryStorageProperty = 0x002D1400 // IOCTL_STORAGE_QUERY_PROPERTY
	query := [12]byte{}
	out := make([]byte, 1024)
	var size uint32
	if err := windows.DeviceIoControl(handle, queryStorageProperty, &query[0], uint32(len(query)), &out[0], uint32(len(out)), &size, nil); err == nil && size >= 32 && size <= uint32(len(out)) {
		info := out[:size]
		vendor := deviceString(info, binary.LittleEndian.Uint32(info[12:16]))
		model := deviceString(info, binary.LittleEndian.Uint32(info[16:20]))
		if model != "" {
			name = strings.TrimSpace(vendor + " " + model)
		}
		if binary.LittleEndian.Uint32(info[28:32]) == 17 { // BusTypeNvme
			kind = "NVMe"
		}
	}
	if kind == "" {
		const seekPenaltyProperty = 7
		binary.LittleEndian.PutUint32(query[:4], seekPenaltyProperty)
		if err := windows.DeviceIoControl(handle, queryStorageProperty, &query[0], uint32(len(query)), &out[0], uint32(len(out)), &size, nil); err == nil && size >= 12 {
			if out[8] != 0 {
				kind = "HDD"
			} else {
				kind = "SSD"
			}
		}
	}
	return kind, name
}

func deviceString(data []byte, offset uint32) string {
	if offset == 0 || offset >= uint32(len(data)) {
		return ""
	}
	text := data[offset:]
	if end := bytes.IndexByte(text, 0); end >= 0 {
		return strings.TrimSpace(string(text[:end]))
	}
	return ""
}

func batteryPower() *bool {
	var power struct {
		AC, Battery, Percentage, Saver uint8
		LifeTime, FullLifeTime         uint32
	}
	if getPowerStatus.Find() != nil {
		return nil
	}
	result, _, _ := getPowerStatus.Call(uintptr(unsafe.Pointer(&power)))
	if result == 0 || power.Battery&128 != 0 || power.AC > 1 {
		return nil
	}
	onBattery := power.AC == 0
	return &onBattery
}
