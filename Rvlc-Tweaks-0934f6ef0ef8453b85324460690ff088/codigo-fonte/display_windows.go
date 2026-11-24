package main

import (
	"errors"

	"golang.org/x/sys/windows"
)

func openAdvancedDisplay(build uint32, launch func(verb, target, arguments string) error) (string, error) {
	const display = "ms-settings:display"
	var advanced string
	switch {
	case build >= 26100: // Windows 11 24H2 and newer.
		advanced = "ms-settings:advanceddisplay"
	case build < 22000: // Windows 10.
		advanced = "ms-settings:display-advanced"
	}
	if advanced != "" {
		err := launch("open", advanced, "")
		if err == nil || errors.Is(err, windows.ERROR_CANCELLED) {
			return "", err
		}
	}
	return "Em Sistema > Tela, selecione Tela avançada para ajustar a taxa de atualização.", launch("open", display, "")
}
