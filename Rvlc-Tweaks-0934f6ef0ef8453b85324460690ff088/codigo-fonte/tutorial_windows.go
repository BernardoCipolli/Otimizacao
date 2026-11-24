package main

import (
	"encoding/json"
	"path/filepath"

	"golang.org/x/sys/windows"
)

const (
	tutorialSteps = 23
	tutorialFile  = "tutorial.json"
)

type tutorialProgress struct {
	Step int    `json:"step"`
	Done uint32 `json:"done"`
}

func (p tutorialProgress) valid() bool {
	return p.Step >= 0 && p.Step < tutorialSteps && p.Done < 1<<tutorialSteps
}

func loadTutorialProgress(directory string) tutorialProgress {
	data, legacy, err := readPrivateFile(filepath.Join(directory, tutorialFile), 2048)
	if err != nil {
		return tutorialProgress{}
	}
	var saved tutorialProgress
	if json.Unmarshal(data, &saved) != nil || !saved.valid() {
		return tutorialProgress{}
	}
	if legacy {
		saveTutorialProgress(directory, saved)
	}
	return saved
}

func saveTutorialProgress(directory string, saved tutorialProgress) bool {
	if !saved.valid() {
		return false
	}
	data, err := json.Marshal(saved)
	return err == nil && writePrivateFile(directory, tutorialFile, data) == nil
}

var tutorialShortcuts = map[string]string{
	"t-gamebar":   "ms-settings:gaming-gamebar",
	"t-sound":     "ms-settings:sound",
	"t-ethernet":  "ms-settings:network-ethernet",
	"t-energy":    "ms-settings:powersleep",
	"t-update":    "ms-settings:windowsupdate",
	"t-discord":   "https://discord.com/download",
	"t-nvclean":   "https://www.techpowerup.com/download/techpowerup-nvcleanstall/",
	"t-winrar":    "https://www.rarlab.com/download.htm",
	"t-vlc":       "https://www.videolan.org/vlc/",
	"t-dell":      "https://www.dell.com/support/home/pt-br",
	"t-spotify":   "https://www.spotify.com/br-pt/download/windows/",
	"t-steam":     "https://store.steampowered.com/about/",
	"t-epic":      "https://store.epicgames.com/pt-BR/download",
	"t-gta":       "https://www.rockstargames.com/gta-v",
	"t-r6":        "https://www.ubisoft.com/pt-br/game/rainbow-six/siege",
	"t-valorant":  "https://playvalorant.com/pt-br/download/",
	"t-obs":       "https://obsproject.com/pt-br/download",
	"t-fivem":     "https://fivem.net/",
	"t-logitech":  "https://support.logi.com/",
	"t-razer":     "https://mysupport.razer.com/",
	"t-corsair":   "https://www.corsair.com/us/en/s/downloads",
	"t-cpuz":      "https://www.cpuid.com/softwares/cpu-z.html",
	"t-pcmanager": "https://apps.microsoft.com/detail/9PM860492SZD",
	"t-drive":     "https://drive.google.com/drive/my-drive",
}

func openTutorialPictures() error {
	pictures, err := windows.KnownFolderPath(windows.FOLDERID_Pictures, 0)
	if err != nil {
		return err
	}
	root := filepath.Join(pictures, "Rvlc Tweaks")
	if err := ensureDirectory(root); err != nil {
		return err
	}
	for _, name := range []string{"R6", "Valorant", "FiveM"} {
		if err := ensureDirectory(filepath.Join(root, name)); err != nil {
			return err
		}
	}
	return shell("open", root, "")
}
