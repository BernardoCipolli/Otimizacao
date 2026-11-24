package main

import (
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

//go:embed downloads/*
var downloadFiles embed.FS

var toolsForDownload = map[string]string{
	"get-nvidia":          "nvidiaProfileInspector.exe",
	"get-rtx-nip":         "RTX 30,40.nip",
	"get-gtx-nip":         "GTX 20 _ below.nip",
	"get-performance-nip": "Config_para_Desempenho.nip",
	"get-rvs-nip":         "rvs.nip",
	"get-nv-reg":          "NVIDIA.reg",
	"get-nv-bat":          "Optimizacao_da_NVIDIA.bat",
	"get-reset-cache":     "ResetCacheSystem.bat",
	"get-cleanup-bat":     "1._Limpar_Arquivos_de_Lixo.bat",
}

func saveDownload(directory, fileName string, data []byte, sourceURL string) (string, bool, error) {
	partial, err := os.CreateTemp(directory, "rvlc-download-*.tmp")
	if err != nil {
		return "", false, err
	}
	defer os.Remove(partial.Name())
	_, writeErr := partial.Write(data)
	if err := errors.Join(writeErr, partial.Close()); err != nil {
		return "", false, err
	}
	mark := "[ZoneTransfer]\r\nZoneId=3\r\n"
	if sourceURL != "" {
		mark += "HostUrl=" + sourceURL + "\r\n"
	}
	originStream := partial.Name() + ":Zone.Identifier"
	marked := os.WriteFile(originStream, []byte(mark), 0600) == nil
	if marked {
		defer os.Remove(originStream)
	}
	name := fileName
	ext := filepath.Ext(fileName)
	stem := strings.TrimSuffix(fileName, ext)
	for copy := 2; ; copy++ {
		destination := filepath.Join(directory, name)
		err := move(partial.Name(), destination, windows.MOVEFILE_WRITE_THROUGH)
		if err == nil {
			stream := destination + ":Zone.Identifier"
			if _, statErr := os.Stat(stream); !marked || statErr != nil {
				marked = os.WriteFile(stream, []byte(mark), 0600) == nil
			}
			return name, marked, nil
		}
		if !errors.Is(err, windows.ERROR_ALREADY_EXISTS) && !errors.Is(err, windows.ERROR_FILE_EXISTS) {
			return "", false, err
		}
		name = fmt.Sprintf("%s (%d)%s", stem, copy, ext)
	}
}

func getDownload(action string) (string, error) {
	var fileName, sourceURL string
	var data []byte
	var err error
	if embedded, ok := toolsForDownload[action]; ok {
		fileName = embedded
		data, err = downloadFiles.ReadFile("downloads/" + fileName)
	} else if action == "get-optimizer" {
		fileName, sourceURL = optimizerRelease.name, optimizerRelease.url
		data, err = fetchProjectRelease(optimizerRelease)
	} else {
		return "", errors.New("arquivo de download desconhecido")
	}
	if err != nil {
		return "", err
	}
	folder, err := windows.KnownFolderPath(windows.FOLDERID_Downloads, 0)
	if err != nil {
		return "", err
	}
	saved, marked, err := saveDownload(folder, fileName, data, sourceURL)
	if err != nil {
		return "", err
	}
	message := fmt.Sprintf("%s salvo em Downloads.", saved)
	if !marked {
		message += " A pasta não aceitou a marca de origem do Windows."
	}
	return message, nil
}
