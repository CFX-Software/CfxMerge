package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const (
	appName        = "CFXMerge"
	registryKey    = `Software\Microsoft\Windows\CurrentVersion\Run`
	settingsFile   = "settings.json"
)

// AppSettings represents application settings
type AppSettings struct {
	HardwareAcceleration bool `json:"hardwareAcceleration"`
	LaunchOnStartup      bool `json:"launchOnStartup"`
}

// GetSettings retrieves current application settings
func (a *App) GetSettings() (*AppSettings, error) {
	settings := &AppSettings{
		HardwareAcceleration: true, // Default enabled
		LaunchOnStartup:      false,
	}

	// Get settings file path
	configDir, err := os.UserConfigDir()
	if err != nil {
		return settings, fmt.Errorf("failed to get config dir: %w", err)
	}

	appConfigDir := filepath.Join(configDir, appName)
	settingsPath := filepath.Join(appConfigDir, settingsFile)

	// Read settings file if it exists
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, settings); err != nil {
			return settings, fmt.Errorf("failed to parse settings: %w", err)
		}
	}

	// Verify launch on startup state from registry
	settings.LaunchOnStartup = a.isLaunchOnStartupEnabled()

	return settings, nil
}

// SetHardwareAcceleration sets hardware acceleration preference
func (a *App) SetHardwareAcceleration(enabled bool) error {
	settings, err := a.GetSettings()
	if err != nil {
		settings = &AppSettings{}
	}

	settings.HardwareAcceleration = enabled
	return a.saveSettings(settings)
}

// SetLaunchOnStartup enables or disables launch on startup
func (a *App) SetLaunchOnStartup(enabled bool) error {
	if enabled {
		return a.enableLaunchOnStartup()
	}
	return a.disableLaunchOnStartup()
}

// enableLaunchOnStartup adds the app to Windows startup
func (a *App) enableLaunchOnStartup() error {
	// Get executable path
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Open registry key
	key, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("failed to open registry key: %w", err)
	}
	defer key.Close()

	// Set the value
	if err := key.SetStringValue(appName, exePath); err != nil {
		return fmt.Errorf("failed to set registry value: %w", err)
	}

	// Update settings
	settings, _ := a.GetSettings()
	settings.LaunchOnStartup = true
	return a.saveSettings(settings)
}

// disableLaunchOnStartup removes the app from Windows startup
func (a *App) disableLaunchOnStartup() error {
	// Open registry key
	key, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("failed to open registry key: %w", err)
	}
	defer key.Close()

	// Delete the value (ignore error if it doesn't exist)
	_ = key.DeleteValue(appName)

	// Update settings
	settings, _ := a.GetSettings()
	settings.LaunchOnStartup = false
	return a.saveSettings(settings)
}

// isLaunchOnStartupEnabled checks if the app is set to launch on startup
func (a *App) isLaunchOnStartupEnabled() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()

	_, _, err = key.GetStringValue(appName)
	return err == nil
}

// saveSettings saves settings to file
func (a *App) saveSettings(settings *AppSettings) error {
	// Get settings file path
	configDir, err := os.UserConfigDir()
	if err != nil {
		return fmt.Errorf("failed to get config dir: %w", err)
	}

	appConfigDir := filepath.Join(configDir, appName)

	// Create config directory if it doesn't exist
	if err := os.MkdirAll(appConfigDir, 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}

	settingsPath := filepath.Join(appConfigDir, settingsFile)

	// Marshal settings to JSON
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	// Write to file
	if err := os.WriteFile(settingsPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
	}

	return nil
}
