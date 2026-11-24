package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type projectRelease struct {
	name   string
	url    string
	size   int64
	sha256 string
}

var optimizerRelease = projectRelease{
	name: "Optimizer-17.0.exe",
	url:  "https://github.com/hellzerg/optimizer/releases/download/17.0/Optimizer-17.0.exe",
	size: 2927616, sha256: "eeb367f0b8c651c10934d985bfa53a94ca56f7c6bff39a44d9bd944514a6dafb",
}

func githubDownloadURL(target *url.URL) bool {
	if target.Scheme != "https" || target.User != nil || (target.Port() != "" && target.Port() != "443") {
		return false
	}
	switch target.Hostname() {
	case "github.com", "raw.githubusercontent.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com":
		return true
	default:
		return false
	}
}

var githubDownloads = &http.Client{
	Timeout: 45 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !githubDownloadURL(req.URL) {
			return errors.New("redirecionamento fora do download oficial")
		}
		return nil
	},
}

func fetchProjectRelease(release projectRelease) ([]byte, error) {
	target, err := url.Parse(release.url)
	if err != nil || !githubDownloadURL(target) {
		return nil, errors.New("endereço de download inválido")
	}
	response, err := githubDownloads.Get(target.String())
	if err != nil {
		return nil, errors.New("não foi possível acessar o GitHub. Confira a conexão e tente novamente")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("o GitHub retornou o código %d para o download", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, release.size+1))
	if err != nil {
		return nil, errors.New("a transferência do GitHub foi interrompida")
	}
	sum := sha256.Sum256(data)
	if int64(len(data)) != release.size || hex.EncodeToString(sum[:]) != release.sha256 {
		return nil, errors.New("o arquivo recebido diverge da versão oficial verificada")
	}
	return data, nil
}
