package main

import (
	"time"

	"github.com/hugolgst/rich-go/client"
)

const (
	discordAppID = "1456944044981620887"
	largeImage   = "cfx-guy"
)

// DiscordRPC manages Discord Rich Presence
type DiscordRPC struct {
	enabled   bool
	startTime time.Time
}

// NewDiscordRPC creates and initializes Discord RPC
func NewDiscordRPC() *DiscordRPC {
	rpc := &DiscordRPC{
		enabled:   false,
		startTime: time.Now(),
	}

	// Try to connect to Discord
	err := client.Login(discordAppID)
	if err == nil {
		rpc.enabled = true
		// Set initial presence
		rpc.UpdateMergerView()
	}

	return rpc
}

// UpdateMergerView updates presence for Merger tab
func (d *DiscordRPC) UpdateMergerView() error {
	if !d.enabled {
		return nil
	}

	return client.SetActivity(client.Activity{
		Details:    "Merging Resources",
		State:      "Managing FiveM assets",
		LargeImage: largeImage,
		LargeText:  "CFX Merge",
		Timestamps: &client.Timestamps{
			Start: &d.startTime,
		},
	})
}

// UpdateConverterView updates presence for Converter tab
func (d *DiscordRPC) UpdateConverterView() error {
	if !d.enabled {
		return nil
	}

	return client.SetActivity(client.Activity{
		Details:    "Converting Files",
		State:      "Processing resources",
		LargeImage: largeImage,
		LargeText:  "CFX Merge",
		Timestamps: &client.Timestamps{
			Start: &d.startTime,
		},
	})
}

// UpdateSettingsView updates presence for Settings tab
func (d *DiscordRPC) UpdateSettingsView() error {
	if !d.enabled {
		return nil
	}

	return client.SetActivity(client.Activity{
		Details:    "Configuring",
		State:      "Adjusting settings",
		LargeImage: largeImage,
		LargeText:  "CFX Merge",
		Timestamps: &client.Timestamps{
			Start: &d.startTime,
		},
	})
}

// UpdateScanning updates presence during active scan
func (d *DiscordRPC) UpdateScanning(filesScanned, totalFiles int) error {
	if !d.enabled {
		return nil
	}

	return client.SetActivity(client.Activity{
		Details:    "Scanning Resources",
		State:      "Detecting duplicates",
		LargeImage: largeImage,
		LargeText:  "CFX Merge",
		Timestamps: &client.Timestamps{
			Start: &d.startTime,
		},
	})
}

// Shutdown cleanly disconnects from Discord
func (d *DiscordRPC) Shutdown() {
	if d.enabled {
		client.Logout()
	}
}
