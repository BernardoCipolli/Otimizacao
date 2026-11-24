package main

import (
	"path/filepath"
	"sync/atomic"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	metricsDLL   = windows.NewLazySystemDLL("kernel32.dll")
	systemTimes  = metricsDLL.NewProc("GetSystemTimes")
	memoryStatus = metricsDLL.NewProc("GlobalMemoryStatusEx")
)

type memoryInfo struct {
	Length, Load                                       uint32
	TotalPhys, AvailPhys, TotalPageFile, AvailPageFile uint64
	TotalVirtual, AvailVirtual, AvailExtendedVirtual   uint64
}

type cpuInfo struct {
	Idle, Kernel, User uint64
}

type usageInfo struct {
	Used  uint64 `json:"used"`
	Total uint64 `json:"total"`
}

type systemMetrics struct {
	CPU        *float64         `json:"cpu"`
	Memory     *usageInfo       `json:"memory"`
	Disk       *usageInfo       `json:"disk"`
	DiskLabel  string           `json:"diskLabel,omitempty"`
	Hardware   *hardwareProfile `json:"hardware,omitempty"`
	Battery    *bool            `json:"battery,omitempty"`
	At         int64            `json:"at"`
	Inspection uint32           `json:"inspection"`
}

type systemMonitor struct {
	disk       string
	previous   cpuInfo
	previousAt time.Time
	hardware   *hardwareProfile
	inspection uint32
	inspect    atomic.Bool
	refresh    chan struct{}
	current    atomic.Pointer[systemMetrics]
}

func newSystemMonitor() *systemMonitor {
	m := &systemMonitor{refresh: make(chan struct{}, 1)}
	if base, err := windows.GetWindowsDirectory(); err == nil {
		m.disk = filepath.VolumeName(base)
	}
	return m
}

func (m *systemMonitor) latest(inspect bool) *systemMetrics {
	if inspect {
		m.inspect.Store(true)
	}
	select {
	case m.refresh <- struct{}{}:
	default:
	}
	return m.current.Load()
}

func (m *systemMonitor) run(done <-chan struct{}) {
	m.current.Store(m.sample())
	m.inspect.Store(true)
	for {
		select {
		case <-done:
			return
		case <-m.refresh:
			if m.inspect.Swap(false) {
				m.hardware = inspectHardware(m.disk)
				m.inspection++
			}
			m.current.Store(m.sample())
		}
	}
}

func ticks(t windows.Filetime) uint64 {
	return uint64(t.HighDateTime)<<32 | uint64(t.LowDateTime)
}

func cpuLoad(previous, now cpuInfo) *float64 {
	if previous == (cpuInfo{}) || now.Idle < previous.Idle || now.Kernel < previous.Kernel || now.User < previous.User {
		return nil
	}
	total := (now.Kernel - previous.Kernel) + (now.User - previous.User)
	if total == 0 {
		return nil
	}
	idle := now.Idle - previous.Idle
	load := float64(total-min(total, idle)) * 100 / float64(total)
	return &load
}

func (m *systemMonitor) sample() *systemMetrics {
	nowAt := time.Now()
	status := &systemMetrics{DiskLabel: m.disk, Hardware: m.hardware, At: nowAt.UnixMilli(),
		Inspection: m.inspection, Battery: batteryPower()}
	if nowAt.Sub(m.previousAt) > 5*time.Second {
		m.previous = cpuInfo{}
	}
	m.previousAt = nowAt
	var idle, kernel, user windows.Filetime
	if systemTimes.Find() == nil {
		if ok, _, _ := systemTimes.Call(uintptr(unsafe.Pointer(&idle)), uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user))); ok != 0 {
			now := cpuInfo{Idle: ticks(idle), Kernel: ticks(kernel), User: ticks(user)}
			status.CPU = cpuLoad(m.previous, now)
			m.previous = now
		}
	}

	memory := memoryInfo{}
	memory.Length = uint32(unsafe.Sizeof(memory))
	if memoryStatus.Find() == nil {
		if ok, _, _ := memoryStatus.Call(uintptr(unsafe.Pointer(&memory))); ok != 0 && memory.TotalPhys > 0 {
			status.Memory = &usageInfo{Used: memory.TotalPhys - min(memory.TotalPhys, memory.AvailPhys), Total: memory.TotalPhys}
		}
	}

	if m.disk != "" {
		path, err := windows.UTF16PtrFromString(m.disk + string(filepath.Separator))
		if err == nil {
			var available, capacity uint64
			if windows.GetDiskFreeSpaceEx(path, nil, &capacity, &available) == nil && capacity != 0 {
				status.Disk = &usageInfo{Used: capacity - min(capacity, available), Total: capacity}
			}
		}
	}
	return status
}
