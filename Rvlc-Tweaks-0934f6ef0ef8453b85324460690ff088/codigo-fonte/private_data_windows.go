package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

const privateDataHeader = "RVLC-DPAPI-v1\n"

var (
	dpapi             = windows.NewLazySystemDLL("crypt32.dll")
	protectDataProc   = dpapi.NewProc("CryptProtectData")
	unprotectDataProc = dpapi.NewProc("CryptUnprotectData")
)

func protectLocal(data []byte, decrypt bool) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("dados locais vazios")
	}
	input := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var output windows.DataBlob
	var err error
	if decrypt {
		if err := unprotectDataProc.Find(); err != nil {
			return nil, err
		}
		err = windows.CryptUnprotectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output)
	} else {
		if err := protectDataProc.Find(); err != nil {
			return nil, err
		}
		err = windows.CryptProtectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output)
	}
	if err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return bytes.Clone(unsafe.Slice(output.Data, output.Size)), nil
}

func readPrivateFile(path string, limit int64) (data []byte, legacy bool, err error) {
	if err := checkType(path, false); err != nil {
		return nil, false, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer file.Close()
	// DPAPI adds Windows account and integrity metadata to the payload.
	const overhead = 16 << 10
	data, err = io.ReadAll(io.LimitReader(file, limit+overhead+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(data)) > limit+overhead {
		return nil, false, errors.New("arquivo local excede o tamanho permitido")
	}
	payload, protected := bytes.CutPrefix(data, []byte(privateDataHeader))
	if protected {
		data, err = protectLocal(payload, true)
		if err != nil {
			return nil, false, errors.New("o Windows não conseguiu ler os dados locais protegidos")
		}
	}
	if int64(len(data)) > limit {
		return nil, false, errors.New("dados locais excedem o tamanho permitido")
	}
	return data, !protected, nil
}

func writePrivateFile(directory, name string, contents []byte) error {
	data, err := protectLocal(contents, false)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(directory, ".rvlc-private-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(append([]byte(privateDataHeader), data...))
	syncErr := file.Sync()
	if err := errors.Join(writeErr, syncErr, file.Close()); err != nil {
		return err
	}
	return move(file.Name(), filepath.Join(directory, name), windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}
