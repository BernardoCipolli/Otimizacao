package main

import (
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	winutilURL   = "https://github.com/ChrisTitusTech/winutil/releases"
	debloaterURL = "https://github.com/Sycnex/Windows10Debloater"
)

var (
	clipboardUser32 = windows.NewLazySystemDLL("user32.dll")
	openClipboard   = clipboardUser32.NewProc("OpenClipboard")
	emptyClipboard  = clipboardUser32.NewProc("EmptyClipboard")
	setClipboard    = clipboardUser32.NewProc("SetClipboardData")
	closeClipboard  = clipboardUser32.NewProc("CloseClipboard")
	clipboardKernel = windows.NewLazySystemDLL("kernel32.dll")
	globalAlloc     = clipboardKernel.NewProc("GlobalAlloc")
	globalLock      = clipboardKernel.NewProc("GlobalLock")
	globalUnlock    = clipboardKernel.NewProc("GlobalUnlock")
	globalFree      = clipboardKernel.NewProc("GlobalFree")
	copyWideString  = clipboardKernel.NewProc("lstrcpynW")
)

func copyProjectURL(owner uintptr, id string) bool {
	var url string
	switch id {
	case "winutil":
		url = winutilURL
	case "debloater":
		url = debloaterURL
	default:
		return false
	}
	chars, err := windows.UTF16FromString(url)
	if err != nil {
		return false
	}
	const movable = 2
	handle, _, _ := globalAlloc.Call(movable, uintptr(len(chars)*2))
	if handle == 0 {
		return false
	}
	defer func() {
		if handle != 0 {
			globalFree.Call(handle)
		}
	}()
	address, _, _ := globalLock.Call(handle)
	if address == 0 {
		return false
	}
	written, _, _ := copyWideString.Call(address, uintptr(unsafe.Pointer(&chars[0])), uintptr(len(chars)))
	runtime.KeepAlive(chars)
	globalUnlock.Call(handle)
	if written == 0 {
		return false
	}
	if opened, _, _ := openClipboard.Call(owner); opened == 0 {
		return false
	}
	defer closeClipboard.Call()
	if emptied, _, _ := emptyClipboard.Call(); emptied == 0 {
		return false
	}
	const unicodeText = 13
	if stored, _, _ := setClipboard.Call(unicodeText, handle); stored == 0 {
		return false
	}
	handle = 0 // The clipboard now owns the allocation.
	return true
}
