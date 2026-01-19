package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/dhowden/tag"
	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
	"github.com/godbus/dbus/v5/prop"
	"github.com/hugolgst/rich-go/client"
	"github.com/tcolgate/mp3"
)

// MPRIS interface constants
const (
	mprisPath      = "/org/mpris/MediaPlayer2"
	mprisInterface = "org.mpris.MediaPlayer2"
	playerInterface = "org.mpris.MediaPlayer2.Player"
	busName        = "org.mpris.MediaPlayer2.Static"
)

// App struct
type App struct {
	ctx           context.Context
	currentSong   *Song
	isPlaying     bool
	discordActive bool
	dbusConn      *dbus.Conn
	mprisProps    *prop.Properties
	settings      *Settings
	songStartTime time.Time // Track when the current song started
	
	// Cover art web server
	coverServer     *http.Server
	coverServerPort int
	coverMutex      sync.RWMutex
	currentCoverURL string
	
	// Cover art cache for uploaded images
	coverCache map[string]string // hash -> imgur URL
	cacheMutex sync.RWMutex
}

// Song represents a single song in a playlist
type Song struct {
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	FilePath    string `json:"filePath"`
	Duration    string `json:"duration"`
	CoverData   string `json:"coverData,omitempty"` // Base64 encoded cover from MP3
	DurationSec int    `json:"durationSec,omitempty"`
}

// PlaylistConfig represents the playlist.toml structure (simplified)
type PlaylistConfig struct {
	Name        string `toml:"name" json:"name"`
	Description string `toml:"description" json:"description"`
	Cover       string `toml:"cover" json:"cover"` // Path to cover image relative to playlist folder
}

// Playlist represents a complete playlist with metadata
type Playlist struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	FolderPath  string `json:"folderPath"`
	Songs       []Song `json:"songs"`
	CoverData   string `json:"coverData,omitempty"` // Base64 encoded playlist cover
}

// Settings represents user preferences
type Settings struct {
	Theme             string  `json:"theme"`             // "dark", "light", "auto"
	Volume            float64 `json:"volume"`            // 0.0 to 1.0
	DiscordRPC        bool    `json:"discordRPC"`        // Enable/disable Discord RPC
	ShowNotifications bool    `json:"showNotifications"` // Show song change notifications
	AutoPlay          bool    `json:"autoPlay"`          // Auto-play next song
	Shuffle           bool    `json:"shuffle"`           // Shuffle mode
	Repeat            string  `json:"repeat"`            // "none", "one", "all"
	StaticFolder      string  `json:"staticFolder"`      // Custom static folder path
	Language          string  `json:"language"`          // UI language
	AccentColor       string  `json:"accentColor"`       // Theme accent color
	KeyboardShortcuts bool    `json:"keyboardShortcuts"` // Enable keyboard shortcuts
	MinimizeToTray    bool    `json:"minimizeToTray"`    // Minimize to system tray
	StartMinimized    bool    `json:"startMinimized"`    // Start application minimized
	ShowLyrics        bool    `json:"showLyrics"`        // Show lyrics if available
}

// MPRIS MediaPlayer2 interface implementation
type MediaPlayer2 struct {
	app *App
}

func (mp *MediaPlayer2) Raise() *dbus.Error {
	return nil
}

func (mp *MediaPlayer2) Quit() *dbus.Error {
	return nil
}

// MPRIS Player interface implementation
type Player struct {
	app *App
}

func (p *Player) Next() *dbus.Error {
	// This would be called from system media controls
	fmt.Println("MPRIS: Next track requested")
	return nil
}

func (p *Player) Previous() *dbus.Error {
	// This would be called from system media controls
	fmt.Println("MPRIS: Previous track requested")
	return nil
}

func (p *Player) Pause() *dbus.Error {
	fmt.Println("MPRIS: Pause requested")
	return nil
}

func (p *Player) PlayPause() *dbus.Error {
	fmt.Println("MPRIS: PlayPause requested")
	return nil
}

func (p *Player) Stop() *dbus.Error {
	fmt.Println("MPRIS: Stop requested")
	return nil
}

func (p *Player) Play() *dbus.Error {
	fmt.Println("MPRIS: Play requested")
	return nil
}

func (p *Player) Seek(offset int64) *dbus.Error {
	fmt.Printf("MPRIS: Seek requested: %d microseconds\n", offset)
	return nil
}

func (p *Player) SetPosition(trackId dbus.ObjectPath, position int64) *dbus.Error {
	fmt.Printf("MPRIS: SetPosition requested: %s, %d microseconds\n", trackId, position)
	return nil
}

func (p *Player) OpenUri(uri string) *dbus.Error {
	fmt.Printf("MPRIS: OpenUri requested: %s\n", uri)
	return nil
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		discordActive: false,
		settings:      getDefaultSettings(),
		coverCache:    make(map[string]string),
	}
}

// getDefaultSettings returns default application settings
func getDefaultSettings() *Settings {
	return &Settings{
		Theme:             "dark",
		Volume:            0.7,
		DiscordRPC:        true,
		ShowNotifications: true,
		AutoPlay:          true,
		Shuffle:           false,
		Repeat:            "none",
		StaticFolder:      "",
		Language:          "en",
		AccentColor:       "blue",
		KeyboardShortcuts: true,
		MinimizeToTray:    false,
		StartMinimized:    false,
		ShowLyrics:        false,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	
	// Load settings
	a.loadSettings()
	
	// Start cover art web server
	go a.startCoverServer()
	
	// Initialize Discord RPC if enabled
	if a.settings.DiscordRPC {
		go a.initDiscordRPC()
	}
	
	// Initialize MPRIS for Linux
	if runtime.GOOS == "linux" {
		go a.initMPRIS()
	}
}

// getSettingsPath returns the path to the settings file
func (a *App) getSettingsPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "settings.json"
	}
	
	configDir := filepath.Join(homeDir, ".config", "static")
	os.MkdirAll(configDir, 0755)
	
	return filepath.Join(configDir, "settings.json")
}

// loadSettings loads settings from file
func (a *App) loadSettings() {
	settingsPath := a.getSettingsPath()
	
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		// File doesn't exist, use defaults
		a.settings = getDefaultSettings()
		a.saveSettings() // Save defaults
		return
	}
	
	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		fmt.Printf("Error parsing settings: %v\n", err)
		a.settings = getDefaultSettings()
		return
	}
	
	a.settings = &settings
	fmt.Println("Settings loaded successfully")
}

// saveSettings saves current settings to file
func (a *App) saveSettings() error {
	settingsPath := a.getSettingsPath()
	
	data, err := json.MarshalIndent(a.settings, "", "  ")
	if err != nil {
		return fmt.Errorf("error marshaling settings: %v", err)
	}
	
	err = os.WriteFile(settingsPath, data, 0644)
	if err != nil {
		return fmt.Errorf("error writing settings file: %v", err)
	}
	
	fmt.Println("Settings saved successfully")
	return nil
}

// GetSettings returns current settings
func (a *App) GetSettings() (*Settings, error) {
	return a.settings, nil
}

// UpdateSettings updates and saves settings
func (a *App) UpdateSettings(newSettings Settings) error {
	// Validate settings
	if newSettings.Volume < 0 || newSettings.Volume > 1 {
		return fmt.Errorf("volume must be between 0 and 1")
	}
	
	if newSettings.Theme != "dark" && newSettings.Theme != "light" && newSettings.Theme != "auto" {
		return fmt.Errorf("invalid theme: %s", newSettings.Theme)
	}
	
	if newSettings.Repeat != "none" && newSettings.Repeat != "one" && newSettings.Repeat != "all" {
		return fmt.Errorf("invalid repeat mode: %s", newSettings.Repeat)
	}
	
	// Update settings
	oldDiscordRPC := a.settings.DiscordRPC
	a.settings = &newSettings
	
	// Handle Discord RPC changes
	if oldDiscordRPC != newSettings.DiscordRPC {
		if newSettings.DiscordRPC && !a.discordActive {
			go a.initDiscordRPC()
		} else if !newSettings.DiscordRPC && a.discordActive {
			client.Logout()
			a.discordActive = false
		}
	}
	
	// Save settings
	return a.saveSettings()
}

// GetAppInfo returns application information
func (a *App) GetAppInfo() map[string]string {
	return map[string]string{
		"name":    "Static",
		"version": "1.0.0",
		"author":  "Static Team",
		"build":   "2024.01.18",
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
	}
}

// ResetSettings resets settings to defaults
func (a *App) ResetSettings() error {
	a.settings = getDefaultSettings()
	return a.saveSettings()
}

// initMPRIS initializes MPRIS D-Bus interface for Linux
func (a *App) initMPRIS() {
	conn, err := dbus.SessionBus()
	if err != nil {
		fmt.Printf("Failed to connect to D-Bus session bus: %v\n", err)
		return
	}
	a.dbusConn = conn

	// Request the bus name
	reply, err := conn.RequestName(busName, dbus.NameFlagDoNotQueue)
	if err != nil {
		fmt.Printf("Failed to request D-Bus name: %v\n", err)
		return
	}
	if reply != dbus.RequestNameReplyPrimaryOwner {
		fmt.Printf("Name %s already taken\n", busName)
		return
	}

	// Create MPRIS objects
	mediaPlayer2 := &MediaPlayer2{app: a}
	player := &Player{app: a}

	// Export the MediaPlayer2 interface
	err = conn.Export(mediaPlayer2, mprisPath, mprisInterface)
	if err != nil {
		fmt.Printf("Failed to export MediaPlayer2 interface: %v\n", err)
		return
	}

	// Export the Player interface
	err = conn.Export(player, mprisPath, playerInterface)
	if err != nil {
		fmt.Printf("Failed to export Player interface: %v\n", err)
		return
	}

	// Create properties
	propsSpec := map[string]map[string]*prop.Prop{
		mprisInterface: {
			"CanQuit":                 {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanRaise":                {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"HasTrackList":            {Value: false, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"Identity":                {Value: "Static", Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"SupportedUriSchemes":     {Value: []string{"file"}, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"SupportedMimeTypes":      {Value: []string{"audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/flac"}, Writable: false, Emit: prop.EmitTrue, Callback: nil},
		},
		playerInterface: {
			"PlaybackStatus": {Value: "Stopped", Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"Rate":           {Value: 1.0, Writable: true, Emit: prop.EmitTrue, Callback: nil},
			"Metadata":       {Value: map[string]dbus.Variant{}, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"Volume":         {Value: 1.0, Writable: true, Emit: prop.EmitTrue, Callback: nil},
			"Position":       {Value: int64(0), Writable: false, Emit: prop.EmitFalse, Callback: nil},
			"MinimumRate":    {Value: 1.0, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"MaximumRate":    {Value: 1.0, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanGoNext":      {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanGoPrevious":  {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanPlay":        {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanPause":       {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanSeek":        {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
			"CanControl":     {Value: true, Writable: false, Emit: prop.EmitTrue, Callback: nil},
		},
	}

	props, err := prop.Export(conn, mprisPath, propsSpec)
	if err != nil {
		fmt.Printf("Failed to export properties: %v\n", err)
		return
	}
	a.mprisProps = props

	// Export introspection
	n := &introspect.Node{
		Name: mprisPath,
		Interfaces: []introspect.Interface{
			introspect.IntrospectData,
			prop.IntrospectData,
			{
				Name:    mprisInterface,
				Methods: introspect.Methods(mediaPlayer2),
			},
			{
				Name:    playerInterface,
				Methods: introspect.Methods(player),
			},
		},
	}
	err = conn.Export(introspect.NewIntrospectable(n), mprisPath, "org.freedesktop.DBus.Introspectable")
	if err != nil {
		fmt.Printf("Failed to export introspection: %v\n", err)
		return
	}

	fmt.Println("MPRIS interface initialized successfully")
}

// updateMPRISMetadata updates MPRIS metadata
func (a *App) updateMPRISMetadata(song *Song, isPlaying bool) error {
	if a.mprisProps == nil {
		return fmt.Errorf("MPRIS not initialized")
	}

	// Update playback status
	status := "Stopped"
	if song != nil {
		if isPlaying {
			status = "Playing"
		} else {
			status = "Paused"
		}
	}
	a.mprisProps.Set(playerInterface, "PlaybackStatus", dbus.MakeVariant(status))

	// Update metadata
	if song != nil {
		metadata := map[string]dbus.Variant{
			"mpris:trackid":  dbus.MakeVariant(dbus.ObjectPath("/track/" + strings.ReplaceAll(song.FilePath, "/", "_"))),
			"xesam:title":    dbus.MakeVariant(song.Title),
			"xesam:artist":   dbus.MakeVariant([]string{song.Artist}),
			"xesam:album":    dbus.MakeVariant(song.Album),
			"mpris:length":   dbus.MakeVariant(int64(song.DurationSec) * 1000000), // microseconds
		}

		// Add artwork if available
		if song.CoverData != "" {
			// Use the saved cover art file
			hash := fmt.Sprintf("%x", song.FilePath)
			tempDir := filepath.Join(os.TempDir(), "static-covers")
			coverPath := filepath.Join(tempDir, hash+".jpg")
			
			// Check if PNG version exists
			if _, err := os.Stat(coverPath); os.IsNotExist(err) {
				coverPath = filepath.Join(tempDir, hash+".png")
			}
			
			if _, err := os.Stat(coverPath); err == nil {
				metadata["mpris:artUrl"] = dbus.MakeVariant("file://" + coverPath)
			}
		}

		a.mprisProps.Set(playerInterface, "Metadata", dbus.MakeVariant(metadata))
		
		fmt.Printf("MPRIS: Updated metadata - %s by %s (%s)\n", song.Title, song.Artist, status)
	} else {
		// Clear metadata
		a.mprisProps.Set(playerInterface, "Metadata", dbus.MakeVariant(map[string]dbus.Variant{}))
	}

	return nil
}

// startCoverServer starts a local HTTP server to serve cover art for Discord RPC
func (a *App) startCoverServer() {
	// Find an available port
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		fmt.Printf("Failed to find available port for cover server: %v\n", err)
		return
	}
	
	a.coverServerPort = listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	
	// Create HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/cover", a.serveCoverArt)
	mux.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Cover server is running!"))
	})
	
	a.coverServer = &http.Server{
		Addr:    ":" + strconv.Itoa(a.coverServerPort),
		Handler: mux,
	}
	
	fmt.Printf("Starting cover art server on port %d\n", a.coverServerPort)
	
	// Start server
	err = a.coverServer.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		fmt.Printf("Cover server error: %v\n", err)
	}
}

// serveCoverArt serves the current song's cover art
func (a *App) serveCoverArt(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("Cover server: Request received from %s\n", r.RemoteAddr)
	
	a.coverMutex.RLock()
	song := a.currentSong
	a.coverMutex.RUnlock()
	
	if song == nil {
		fmt.Println("Cover server: No current song")
		// Serve a default music icon
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		defaultIcon := `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
		w.Write([]byte(defaultIcon))
		return
	}
	
	if song.CoverData == "" {
		fmt.Printf("Cover server: Song '%s' has no cover data\n", song.Title)
		// Serve a default music icon
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		defaultIcon := `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
		w.Write([]byte(defaultIcon))
		return
	}
	
	fmt.Printf("Cover server: Serving cover for '%s'\n", song.Title)
	
	// Parse the data URL
	parts := strings.Split(song.CoverData, ",")
	if len(parts) != 2 {
		fmt.Printf("Cover server: Invalid cover data format for '%s'\n", song.Title)
		http.Error(w, "Invalid cover data", http.StatusInternalServerError)
		return
	}
	
	// Decode base64 image data
	imageData, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		fmt.Printf("Cover server: Failed to decode image for '%s': %v\n", song.Title, err)
		http.Error(w, "Failed to decode image", http.StatusInternalServerError)
		return
	}
	
	// Set content type based on data URL
	if strings.Contains(parts[0], "image/jpeg") {
		w.Header().Set("Content-Type", "image/jpeg")
	} else if strings.Contains(parts[0], "image/png") {
		w.Header().Set("Content-Type", "image/png")
	} else if strings.Contains(parts[0], "image/webp") {
		w.Header().Set("Content-Type", "image/webp")
	} else {
		w.Header().Set("Content-Type", "image/jpeg") // default
	}
	
	// Enable CORS for Discord
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "no-cache")
	
	w.WriteHeader(http.StatusOK)
	w.Write(imageData)
	
	fmt.Printf("Cover server: Successfully served %d bytes for '%s'\n", len(imageData), song.Title)
}

// Custom Discord RPC activity with type support
type CustomActivity struct {
	Type       int                    `json:"type"`
	Details    string                 `json:"details,omitempty"`
	State      string                 `json:"state,omitempty"`
	Timestamps *client.Timestamps     `json:"timestamps,omitempty"`
	Assets     *CustomAssets          `json:"assets,omitempty"`
}

type CustomAssets struct {
	LargeImage string `json:"large_image,omitempty"`
	LargeText  string `json:"large_text,omitempty"`
	SmallImage string `json:"small_image,omitempty"`
	SmallText  string `json:"small_text,omitempty"`
}

type CustomRPCPayload struct {
	Cmd   string        `json:"cmd"`
	Args  CustomRPCArgs `json:"args"`
	Nonce string        `json:"nonce"`
}

type CustomRPCArgs struct {
	PID      int            `json:"pid"`
	Activity CustomActivity `json:"activity"`
}

// setCustomActivity sends a custom activity with type support via raw IPC
func (a *App) setCustomActivity(activity CustomActivity) error {
	// Create the payload
	payload := map[string]interface{}{
		"cmd":   "SET_ACTIVITY",
		"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
		"args": map[string]interface{}{
			"pid":      os.Getpid(),
			"activity": activity,
		},
	}
	
	// Convert to JSON for logging
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %v", err)
	}
	
	fmt.Printf("Custom Discord RPC: Sending activity type %d: %s (payload: %d bytes)\n", activity.Type, activity.Details, len(data))
	
	// For now, we'll use the regular rich-go client but log what we would send
	// In a full implementation, we'd send this via raw IPC
	
	// Fallback to regular rich-go for now
	regularActivity := client.Activity{
		Details:    activity.Details,
		State:      activity.State,
		Timestamps: activity.Timestamps,
	}
	
	if activity.Assets != nil {
		regularActivity.LargeImage = activity.Assets.LargeImage
		regularActivity.LargeText = activity.Assets.LargeText
		regularActivity.SmallImage = activity.Assets.SmallImage
		regularActivity.SmallText = activity.Assets.SmallText
	}
	
	return client.SetActivity(regularActivity)
}
// uploadCoverAndUpdate uploads cover to Imgur and updates Discord RPC
func (a *App) uploadCoverAndUpdate(song *Song) {
	if song.CoverData == "" {
		return
	}
	
	// Parse the data URL to get image data
	parts := strings.Split(song.CoverData, ",")
	if len(parts) != 2 {
		fmt.Println("Invalid cover data format")
		return
	}
	
	// Decode base64 image data
	imageData, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		fmt.Printf("Failed to decode cover data: %v\n", err)
		return
	}
	
	// Upload to Imgur
	url, err := a.uploadCoverToImgur(imageData)
	if err != nil {
		fmt.Printf("Failed to upload cover to Imgur: %v\n", err)
		return
	}
	
	// Update the cover URL
	a.coverMutex.Lock()
	a.currentCoverURL = url
	a.coverMutex.Unlock()
	
	fmt.Printf("Cover uploaded to Imgur: %s\n", url)
	
	// Update Discord RPC with new cover
	if a.discordActive && a.currentSong != nil {
		a.UpdateDiscordPresence(a.currentSong, a.isPlaying)
	}
}

// Custom Discord IPC connection
type CustomDiscordRPC struct {
	conn   net.Conn
	appID  string
	active bool
	mutex  sync.Mutex
}

// sendCustomActivity sends activity with type field via raw Discord IPC
func (a *App) sendCustomActivity(activity CustomActivity) error {
	if !a.discordActive {
		return fmt.Errorf("Discord RPC not active")
	}

	// Create the payload
	payload := CustomRPCPayload{
		Cmd: "SET_ACTIVITY",
		Args: CustomRPCArgs{
			PID:      os.Getpid(),
			Activity: activity,
		},
		Nonce: fmt.Sprintf("%d", time.Now().UnixNano()),
	}

	// Marshal to JSON
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %v", err)
	}

	fmt.Printf("Custom Discord RPC: Sending activity with type %d\n", activity.Type)
	fmt.Printf("Custom Discord RPC: Payload: %s\n", string(data))

	// For now, we'll use the regular rich-go client but log what we would send
	// In a full implementation, we'd send this via raw IPC
	
	return nil
}
func (a *App) uploadCoverToImgur(imageData []byte) (string, error) {
	// Create hash for caching
	hasher := md5.New()
	hasher.Write(imageData)
	hash := hex.EncodeToString(hasher.Sum(nil))
	
	// Check cache first
	a.cacheMutex.RLock()
	if url, exists := a.coverCache[hash]; exists {
		a.cacheMutex.RUnlock()
		fmt.Printf("Using cached Imgur URL: %s\n", url)
		return url, nil
	}
	a.cacheMutex.RUnlock()
	
	// Upload to Imgur (anonymous upload - no API key needed)
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	
	// Add image field
	part, err := writer.CreateFormField("image")
	if err != nil {
		return "", fmt.Errorf("failed to create form field: %v", err)
	}
	
	// Encode image as base64
	encoded := base64.StdEncoding.EncodeToString(imageData)
	part.Write([]byte(encoded))
	
	writer.Close()
	
	// Create request
	req, err := http.NewRequest("POST", "https://api.imgur.com/3/image", &buf)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}
	
	// Set headers
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Client-ID 546c25a59c58ad7") // Public anonymous client ID
	
	// Send request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to upload to Imgur: %v", err)
	}
	defer resp.Body.Close()
	
	// Parse response
	var result struct {
		Data struct {
			Link string `json:"link"`
		} `json:"data"`
		Success bool `json:"success"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse Imgur response: %v", err)
	}
	
	if !result.Success {
		return "", fmt.Errorf("Imgur upload failed")
	}
	
	// Cache the result
	a.cacheMutex.Lock()
	a.coverCache[hash] = result.Data.Link
	a.cacheMutex.Unlock()
	
	fmt.Printf("Uploaded to Imgur: %s\n", result.Data.Link)
	return result.Data.Link, nil
}
// updateCoverURL updates the current cover URL for Discord RPC
func (a *App) updateCoverURL() {
	a.coverMutex.Lock()
	defer a.coverMutex.Unlock()
	
	// Reset cover URL initially
	a.currentCoverURL = ""
	
	// If we have a song with cover data, trigger Imgur upload
	if a.currentSong != nil && a.currentSong.CoverData != "" {
		fmt.Printf("Triggering Imgur upload for: %s\n", a.currentSong.Title)
		// Upload will happen in background and update the URL
		go a.uploadCoverAndUpdate(a.currentSong)
	}
}
func (a *App) initDiscordRPC() {
	fmt.Println("Attempting to initialize Discord RPC...")
	
	// Check if Discord is running by trying to connect
	err := client.Login("1418623365631181003") // Discord application ID
	if err != nil {
		fmt.Printf("Failed to initialize Discord RPC: %v\n", err)
		
		// Provide more specific error messages
		if strings.Contains(err.Error(), "connection refused") || strings.Contains(err.Error(), "no such file") {
			fmt.Println("Discord is not running or Discord RPC is not available")
		} else if strings.Contains(err.Error(), "invalid") {
			fmt.Println("Invalid Discord application ID - you may need to create a Discord application")
		} else {
			fmt.Printf("Unknown Discord RPC error: %v\n", err)
		}
		
		a.discordActive = false
		return
	}
	
	a.discordActive = true
	fmt.Println("Discord RPC connected successfully!")
	
	// Set initial presence
	err = client.SetActivity(client.Activity{
		State:      "Ready to play music",
		Details:    "Static",
		LargeImage: "music_icon", // This needs to be uploaded to Discord app assets
		LargeText:  "Static",
	})
	
	if err != nil {
		fmt.Printf("Failed to set initial Discord presence: %v\n", err)
		// Don't mark as inactive just because we can't set activity
		// The connection might still work for song updates
	} else {
		fmt.Println("Initial Discord presence set successfully")
	}
}

// UpdateDiscordPresence updates Discord Rich Presence with current song
func (a *App) UpdateDiscordPresence(song *Song, isPlaying bool) error {
	if !a.discordActive {
		fmt.Println("Discord RPC not active - skipping presence update")
		return fmt.Errorf("Discord RPC not active")
	}

	var state, details string
	var largeImage, smallImage string
	
	if song != nil {
		// Format like Spotify: "Listening to [song name]" for details, "by Artist" for state
		if isPlaying {
			details = song.Title  // Just the song name
		} else {
			details = song.Title  // Just the song name when paused too
		}
		state = fmt.Sprintf("by %s", song.Artist)
		
		// Use Imgur URL if available, fallback to static icon
		a.coverMutex.RLock()
		coverURL := a.currentCoverURL
		a.coverMutex.RUnlock()
		
		if coverURL != "" {
			largeImage = coverURL
			fmt.Printf("Using Imgur cover URL: %s\n", coverURL)
		} else {
			largeImage = "music_icon" // Fallback to static asset
			// Try to upload to Imgur if we have cover data
			if song.CoverData != "" {
				go a.uploadCoverAndUpdate(song)
			}
		}
		
		// Set small image based on play state
		if isPlaying {
			smallImage = "play_icon"
		} else {
			smallImage = "pause_icon"
		}
	} else {
		details = "Static"
		state = "Ready to play music"
		largeImage = "music_icon"
		smallImage = ""
	}

	// Create custom activity with type 2 (Listening)
	activity := CustomActivity{
		Type:    2, // 2 = Listening (shows music note icon)
		Details: details,
		State:   state,
		Assets: &CustomAssets{
			LargeImage: largeImage,
			LargeText: func() string {
				if song != nil {
					return fmt.Sprintf("%s - %s", song.Artist, song.Title)
				}
				return "Static"
			}(),
			SmallImage: smallImage,
			SmallText: func() string {
				if song != nil {
					return map[bool]string{true: "Playing", false: "Paused"}[isPlaying]
				}
				return "Ready"
			}(),
		},
	}

	// Add timestamps for song progress bar (like Spotify)
	if song != nil && isPlaying && song.DurationSec > 0 {
		now := time.Now()
		endTime := now.Add(time.Duration(song.DurationSec) * time.Second)
		activity.Timestamps = &client.Timestamps{
			Start: &now,
			End:   &endTime,
		}
		fmt.Printf("Discord RPC: Set initial timestamps for new song - duration: %ds\n", song.DurationSec)
	}

	fmt.Printf("Discord RPC: Setting LISTENING activity - %s (%s) with image: %s\n", details, state, largeImage)
	
	err := a.setCustomActivity(activity)
	if err != nil {
		fmt.Printf("Discord RPC: Failed to set activity: %v\n", err)
		a.discordActive = false
		return err
	}
	
	return nil
}

// saveCoverForDiscord saves cover art for Discord RPC and returns the file path
func (a *App) saveCoverForDiscord(song *Song) string {
	if song.CoverData == "" {
		return ""
	}

	// Create discord covers directory
	discordDir := filepath.Join(os.TempDir(), "static-discord")
	os.MkdirAll(discordDir, 0755)

	// Generate filename based on song path hash
	hasher := md5.New()
	hasher.Write([]byte(song.FilePath))
	hash := hex.EncodeToString(hasher.Sum(nil))
	
	// Extract image data from base64 data URL
	parts := strings.Split(song.CoverData, ",")
	if len(parts) != 2 {
		return ""
	}
	
	imageData, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		fmt.Printf("Error decoding cover data: %v\n", err)
		return ""
	}
	
	// Determine file extension from MIME type
	ext := ".jpg"
	if strings.Contains(parts[0], "png") {
		ext = ".png"
	}
	
	coverPath := filepath.Join(discordDir, hash+ext)
	
	// Save cover art
	err = os.WriteFile(coverPath, imageData, 0644)
	if err != nil {
		fmt.Printf("Error saving Discord cover: %v\n", err)
		return ""
	}
	
	fmt.Printf("Saved Discord cover: %s\n", coverPath)
	return coverPath
}

// SetCurrentSong sets the current playing song and updates media controls
func (a *App) SetCurrentSong(song *Song, isPlaying bool) error {
	a.currentSong = song
	a.isPlaying = isPlaying
	
	// Update cover URL for Discord RPC
	a.updateCoverURL()
	
	// Record when the song started for accurate progress tracking
	if song != nil && isPlaying {
		a.songStartTime = time.Now()
	}

	// Update Discord RPC - try to reconnect if it failed
	if err := a.UpdateDiscordPresence(song, isPlaying); err != nil {
		fmt.Printf("Failed to update Discord presence: %v\n", err)
		// Try to reconnect Discord RPC if it's enabled in settings
		if a.settings.DiscordRPC && !a.discordActive {
			fmt.Println("Attempting to reconnect Discord RPC...")
			go a.initDiscordRPC()
		}
	}

	// Update OS media controls
	if err := a.updateOSMediaControls(song, isPlaying); err != nil {
		fmt.Printf("Failed to update OS media controls: %v\n", err)
	}

	return nil
}

// UpdateDiscordPresenceWithPosition updates Discord RPC with current playback position
func (a *App) UpdateDiscordPresenceWithPosition(currentTimeSeconds float64) error {
	if !a.discordActive || a.currentSong == nil {
		return nil
	}

	song := a.currentSong
	isPlaying := a.isPlaying
	
	// Format like Spotify
	details := song.Title
	state := fmt.Sprintf("by %s", song.Artist)
	
	// Use Imgur URL if available
	a.coverMutex.RLock()
	coverURL := a.currentCoverURL
	a.coverMutex.RUnlock()
	
	var largeImage string
	if coverURL != "" {
		largeImage = coverURL
	} else {
		largeImage = "music_icon"
	}
	
	var smallImage string
	if isPlaying {
		smallImage = "play_icon"
	} else {
		smallImage = "pause_icon"
	}

	activity := CustomActivity{
		Type:    2, // 2 = Listening
		Details: details,
		State:   state,
		Assets: &CustomAssets{
			LargeImage: largeImage,
			LargeText:  fmt.Sprintf("%s - %s", song.Artist, song.Title),
			SmallImage: smallImage,
			SmallText:  map[bool]string{true: "Playing", false: "Paused"}[isPlaying],
		},
	}

	// Add timestamps for accurate progress bar
	if isPlaying && song.DurationSec > 0 {
		now := time.Now()
		// Calculate when the song actually started based on current position
		songStartTime := now.Add(-time.Duration(currentTimeSeconds) * time.Second)
		// Calculate when the song will end
		songEndTime := songStartTime.Add(time.Duration(song.DurationSec) * time.Second)
		
		// Ensure timestamps are valid (start should be before end)
		if songStartTime.Before(songEndTime) {
			activity.Timestamps = &client.Timestamps{
				Start: &songStartTime,
				End:   &songEndTime,
			}
			fmt.Printf("Discord RPC: Updated timestamps - elapsed: %.1fs, total: %ds\n", currentTimeSeconds, song.DurationSec)
		} else {
			fmt.Printf("Discord RPC: Invalid timestamps, skipping - elapsed: %.1fs, total: %ds\n", currentTimeSeconds, song.DurationSec)
		}
	}

	err := a.setCustomActivity(activity)
	if err != nil {
		fmt.Printf("Discord RPC: Failed to update activity: %v\n", err)
		a.discordActive = false
		return err
	}
	
	return nil
}

// updateOSMediaControls updates OS-specific media controls
func (a *App) updateOSMediaControls(song *Song, isPlaying bool) error {
	if song == nil {
		return nil
	}

	switch runtime.GOOS {
	case "windows":
		return a.updateWindowsMediaControls(song, isPlaying)
	case "darwin":
		return a.updateMacOSMediaControls(song, isPlaying)
	case "linux":
		return a.updateLinuxMediaControls(song, isPlaying)
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// updateWindowsMediaControls updates Windows media controls
func (a *App) updateWindowsMediaControls(song *Song, isPlaying bool) error {
	// For Windows, we would use Windows Runtime APIs
	// This is a placeholder - would need Windows-specific implementation
	fmt.Printf("Windows Media Control: %s - %s (%s)\n", song.Artist, song.Title, map[bool]string{true: "Playing", false: "Paused"}[isPlaying])
	return nil
}

// updateMacOSMediaControls updates macOS media controls
func (a *App) updateMacOSMediaControls(song *Song, isPlaying bool) error {
	// For macOS, we would use MediaPlayer framework or AppleScript
	// This is a placeholder - would need macOS-specific implementation
	fmt.Printf("macOS Media Control: %s - %s (%s)\n", song.Artist, song.Title, map[bool]string{true: "Playing", false: "Paused"}[isPlaying])
	return nil
}

// updateLinuxMediaControls updates Linux media controls via MPRIS
func (a *App) updateLinuxMediaControls(song *Song, isPlaying bool) error {
	return a.updateMPRISMetadata(song, isPlaying)
}

// GetStaticFolderPath returns the static folder path based on settings or OS
func (a *App) GetStaticFolderPath() string {
	// Use custom path if set in settings
	if a.settings.StaticFolder != "" {
		return a.settings.StaticFolder
	}
	
	// Default OS-based paths
	switch runtime.GOOS {
	case "windows":
		return "C:\\static"
	default: // linux, darwin (macOS)
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		return filepath.Join(homeDir, "static")
	}
}

// getDurationFromMP3 extracts duration from MP3 file
func (a *App) getDurationFromMP3(filePath string) (time.Duration, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	decoder := mp3.NewDecoder(file)
	var totalDuration time.Duration
	var frame mp3.Frame
	skipped := 0
	
	for {
		if err := decoder.Decode(&frame, &skipped); err != nil {
			if err == io.EOF {
				break
			}
			// If we can't decode, return 0 duration
			return 0, nil
		}
		totalDuration += frame.Duration()
	}
	
	return totalDuration, nil
}

// formatDuration converts duration to MM:SS format
func (a *App) formatDuration(d time.Duration) string {
	minutes := int(d.Minutes())
	seconds := int(d.Seconds()) % 60
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}

// extractMetadata extracts metadata from an audio file
func (a *App) extractMetadata(filePath string) (Song, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return Song{}, err
	}
	defer file.Close()

	song := Song{
		FilePath: filePath,
	}

	// Extract metadata using tag library
	metadata, err := tag.ReadFrom(file)
	if err == nil {
		song.Title = metadata.Title()
		song.Artist = metadata.Artist()
		song.Album = metadata.Album()

		// Extract cover art
		picture := metadata.Picture()
		if picture != nil {
			coverData := base64.StdEncoding.EncodeToString(picture.Data)
			song.CoverData = fmt.Sprintf("data:%s;base64,%s", picture.MIMEType, coverData)
			
			// For MPRIS, also save cover to temp file
			if runtime.GOOS == "linux" {
				a.saveCoverArtForMPRIS(filePath, picture.Data, picture.MIMEType)
			}
		}
	}

	// If title is empty, use filename
	if song.Title == "" {
		name := filepath.Base(filePath)
		song.Title = strings.TrimSuffix(name, filepath.Ext(name))
	}

	// If artist is empty, set default
	if song.Artist == "" {
		song.Artist = "Unknown Artist"
	}

	// If album is empty, set default
	if song.Album == "" {
		song.Album = "Unknown Album"
	}

	// Extract duration for different audio formats
	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".mp3" {
		if duration, err := a.getDurationFromMP3(filePath); err == nil {
			song.Duration = a.formatDuration(duration)
			song.DurationSec = int(duration.Seconds())
		}
	} else {
		// For other formats, try to get duration from metadata
		if metadata != nil {
			// Some tag libraries provide duration, but dhowden/tag doesn't
			// For now, we'll leave it as 0:00 for non-MP3 files
			// In a production app, you'd want to use a more comprehensive audio library
		}
	}

	// Fallback duration if not extracted
	if song.Duration == "" {
		song.Duration = "0:00"
	}

	return song, nil
}

// saveCoverArtForMPRIS saves cover art to a temporary file for MPRIS
func (a *App) saveCoverArtForMPRIS(audioPath string, coverData []byte, mimeType string) {
	if len(coverData) == 0 {
		return
	}

	// Create temp directory for covers
	tempDir := filepath.Join(os.TempDir(), "static-covers")
	os.MkdirAll(tempDir, 0755)

	// Generate filename based on audio file path
	hash := fmt.Sprintf("%x", audioPath)
	ext := ".jpg"
	if strings.Contains(mimeType, "png") {
		ext = ".png"
	}
	
	coverPath := filepath.Join(tempDir, hash+ext)
	
	// Save cover art
	err := os.WriteFile(coverPath, coverData, 0644)
	if err != nil {
		fmt.Printf("Failed to save cover art: %v\n", err)
	}
}

// GetPlaylists scans the static folder and returns all playlists
func (a *App) GetPlaylists() ([]Playlist, error) {
	staticPath := a.GetStaticFolderPath()
	fmt.Printf("GetPlaylists called - looking in: %s\n", staticPath)
	
	// Check if static folder exists
	if _, err := os.Stat(staticPath); os.IsNotExist(err) {
		fmt.Printf("Static folder not found at: %s\n", staticPath)
		return []Playlist{}, fmt.Errorf("static folder not found at: %s", staticPath)
	}

	fmt.Printf("Static folder exists at: %s\n", staticPath)
	var playlists []Playlist

	// Walk through the static directory
	err := filepath.WalkDir(staticPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			fmt.Printf("Error walking directory %s: %v\n", path, err)
			return err
		}

		// Skip the root static directory
		if path == staticPath {
			return nil
		}

		// Only process directories that are direct children of static
		if d.IsDir() && filepath.Dir(path) == staticPath {
			fmt.Printf("Found potential playlist directory: %s\n", path)
			playlist, err := a.loadPlaylist(path)
			if err != nil {
				fmt.Printf("Error loading playlist %s: %v\n", path, err)
				return nil // Continue with other playlists
			}
			playlists = append(playlists, playlist)
		}

		return nil
	})

	if err != nil {
		fmt.Printf("Error scanning playlists: %v\n", err)
		return nil, fmt.Errorf("error scanning playlists: %v", err)
	}

	fmt.Printf("Found %d playlists total\n", len(playlists))
	return playlists, nil
}

// loadPlaylist loads a single playlist from its folder
func (a *App) loadPlaylist(playlistDir string) (Playlist, error) {
	playlistFile := filepath.Join(playlistDir, "playlist.toml")
	
	var config PlaylistConfig
	var songs []Song

	// Load playlist config if exists
	if _, err := os.Stat(playlistFile); err == nil {
		if _, err := toml.DecodeFile(playlistFile, &config); err != nil {
			return Playlist{}, fmt.Errorf("error parsing playlist.toml: %v", err)
		}
	}

	// Set default playlist info if not provided
	if config.Name == "" {
		config.Name = filepath.Base(playlistDir)
	}
	if config.Description == "" {
		config.Description = "Auto-generated playlist"
	}

	// Load playlist cover if specified
	var coverData string
	if config.Cover != "" {
		coverPath := filepath.Join(playlistDir, config.Cover)
		if _, err := os.Stat(coverPath); err == nil {
			// Read cover image
			imageData, err := os.ReadFile(coverPath)
			if err == nil {
				// Determine MIME type from extension
				ext := strings.ToLower(filepath.Ext(coverPath))
				var mimeType string
				switch ext {
				case ".jpg", ".jpeg":
					mimeType = "image/jpeg"
				case ".png":
					mimeType = "image/png"
				case ".webp":
					mimeType = "image/webp"
				case ".gif":
					mimeType = "image/gif"
				default:
					mimeType = "image/jpeg"
				}
				
				// Encode to base64 data URL
				encoded := base64.StdEncoding.EncodeToString(imageData)
				coverData = fmt.Sprintf("data:%s;base64,%s", mimeType, encoded)
				fmt.Printf("Loaded playlist cover: %s\n", coverPath)
			} else {
				fmt.Printf("Error reading cover file %s: %v\n", coverPath, err)
			}
		} else {
			fmt.Printf("Cover file not found: %s\n", coverPath)
		}
	}

	// Auto-scan for music files in the musics folder
	musicsDir := filepath.Join(playlistDir, "musics")
	if _, err := os.Stat(musicsDir); err == nil {
		err := filepath.WalkDir(musicsDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !d.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".mp3" || ext == ".wav" || ext == ".ogg" || ext == ".m4a" || ext == ".flac" {
					fmt.Printf("Processing audio file: %s\n", path)
					metadata, err := a.extractMetadata(path)
					if err == nil {
						songs = append(songs, metadata)
					} else {
						fmt.Printf("Error extracting metadata from %s: %v\n", path, err)
					}
				}
			}
			return nil
		})
		if err != nil {
			return Playlist{}, err
		}
	}

	playlist := Playlist{
		Name:        config.Name,
		Description: config.Description,
		FolderPath:  playlistDir,
		Songs:       songs,
		CoverData:   coverData,
	}

	fmt.Printf("Loaded playlist '%s' with %d songs\n", playlist.Name, len(songs))
	return playlist, nil
}

// GetSongFile returns the file path for a song (for audio streaming)
func (a *App) GetSongFile(filePath string) (string, error) {
	// Verify file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "", fmt.Errorf("song file not found: %s", filePath)
	}
	return filePath, nil
}

// processAudioWithFFmpeg applies audio effects using FFmpeg
func (a *App) processAudioWithFFmpeg(inputPath string, nightcore bool, bassBoost bool) ([]byte, error) {
	// Create cache directory
	cacheDir := filepath.Join(os.TempDir(), "static-cache")
	os.MkdirAll(cacheDir, 0755)

	// Generate cache key based on file path and effects
	hasher := md5.New()
	hasher.Write([]byte(inputPath))
	hasher.Write([]byte(fmt.Sprintf("nightcore:%t,bassboost:%t", nightcore, bassBoost)))
	cacheKey := hex.EncodeToString(hasher.Sum(nil))
	cachedFile := filepath.Join(cacheDir, cacheKey+".mp3")

	// Check if cached version exists
	if _, err := os.Stat(cachedFile); err == nil {
		fmt.Printf("Using cached processed audio: %s\n", cachedFile)
		return os.ReadFile(cachedFile)
	}

	// Build FFmpeg filter chain
	var filters []string
	
	if bassBoost {
		// Bass boost: amplify frequencies below 200Hz by 10dB
		filters = append(filters, "bass=g=10:f=200:w=1")
	}
	
	if nightcore {
		// Nightcore: increase tempo by 1.2x and pitch by 3 semitones
		// Use rubberband for better quality pitch shifting
		filters = append(filters, "rubberband=tempo=1.2:pitch=1.189") // 1.189 ≈ 3 semitones
	}

	// If no effects, just copy the file
	if len(filters) == 0 {
		return os.ReadFile(inputPath)
	}

	// Build FFmpeg command with better settings
	filterChain := strings.Join(filters, ",")
	cmd := exec.Command("ffmpeg", 
		"-i", inputPath,
		"-af", filterChain,
		"-acodec", "libmp3lame",
		"-b:a", "192k",
		"-ar", "44100",
		"-ac", "2", // stereo
		"-f", "mp3",
		"-y", // overwrite output file
		cachedFile,
	)

	fmt.Printf("Running FFmpeg: %s\n", cmd.String())
	
	// Run FFmpeg with timeout
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Try fallback without rubberband for nightcore
		if nightcore && strings.Contains(string(output), "rubberband") {
			fmt.Println("Rubberband not available, using atempo + asetrate fallback")
			filters = []string{}
			if bassBoost {
				filters = append(filters, "bass=g=10:f=200:w=1")
			}
			if nightcore {
				// Fallback: use atempo for speed and asetrate for pitch
				filters = append(filters, "atempo=1.2", "asetrate=44100*1.189")
			}
			
			filterChain = strings.Join(filters, ",")
			cmd = exec.Command("ffmpeg", 
				"-i", inputPath,
				"-af", filterChain,
				"-acodec", "libmp3lame",
				"-b:a", "192k",
				"-ar", "44100",
				"-ac", "2",
				"-f", "mp3",
				"-y",
				cachedFile,
			)
			
			output, err = cmd.CombinedOutput()
		}
		
		if err != nil {
			return nil, fmt.Errorf("FFmpeg error: %v\nOutput: %s", err, string(output))
		}
	}

	fmt.Printf("FFmpeg processing complete: %s\n", cachedFile)
	
	// Read processed file
	return os.ReadFile(cachedFile)
}

// checkFFmpegAvailable checks if FFmpeg is installed and available
func (a *App) checkFFmpegAvailable() bool {
	cmd := exec.Command("ffmpeg", "-version")
	err := cmd.Run()
	return err == nil
}
// GetSongFileURL returns a data URL for the song file with optional audio effects applied
func (a *App) GetSongFileURL(filePath string, nightcore bool, bassBoost bool) (string, error) {
	fmt.Printf("GetSongFileURL called: file=%s, nightcore=%t, bassBoost=%t\n", filePath, nightcore, bassBoost)
	
	// Verify file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "", fmt.Errorf("song file not found: %s", filePath)
	}

	var data []byte
	var err error

	// Apply audio effects if requested and FFmpeg is available
	if (nightcore || bassBoost) && a.checkFFmpegAvailable() {
		fmt.Printf("Processing audio with effects: nightcore=%t, bassBoost=%t\n", nightcore, bassBoost)
		data, err = a.processAudioWithFFmpeg(filePath, nightcore, bassBoost)
		if err != nil {
			fmt.Printf("FFmpeg processing failed, falling back to original: %v\n", err)
			// Fallback to original file if processing fails
			data, err = os.ReadFile(filePath)
			if err != nil {
				return "", fmt.Errorf("error reading file: %v", err)
			}
		}
	} else {
		// No effects or FFmpeg not available, read original file
		if nightcore || bassBoost {
			fmt.Println("FFmpeg not available, effects will be ignored")
		}
		fmt.Printf("Reading original file: %s\n", filePath)
		data, err = os.ReadFile(filePath)
		if err != nil {
			return "", fmt.Errorf("error reading file: %v", err)
		}
	}

	fmt.Printf("Audio data size: %d bytes\n", len(data))

	// Determine MIME type based on extension
	ext := strings.ToLower(filepath.Ext(filePath))
	var mimeType string
	switch ext {
	case ".mp3":
		mimeType = "audio/mpeg"
	case ".wav":
		mimeType = "audio/wav"
	case ".ogg":
		mimeType = "audio/ogg"
	case ".m4a":
		mimeType = "audio/mp4"
	case ".flac":
		mimeType = "audio/flac"
	default:
		mimeType = "audio/mpeg"
	}

	// Create data URL
	encoded := base64.StdEncoding.EncodeToString(data)
	dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, encoded)

	fmt.Printf("Generated data URL, total length: %d\n", len(dataURL))
	return dataURL, nil
}

// NotifyPlaybackState notifies the backend about playback state changes
func (a *App) NotifyPlaybackState(song Song, isPlaying bool) error {
	return a.SetCurrentSong(&song, isPlaying)
}

// UpdatePlaybackPosition updates Discord RPC with current playback position
func (a *App) UpdatePlaybackPosition(currentTimeSeconds float64) error {
	return a.UpdateDiscordPresenceWithPosition(currentTimeSeconds)
}

// CheckFFmpegInstalled checks if FFmpeg is available on the system
func (a *App) CheckFFmpegInstalled() bool {
	return a.checkFFmpegAvailable()
}

// ClearAudioCache clears all cached processed audio files
func (a *App) ClearAudioCache() error {
	cacheDir := filepath.Join(os.TempDir(), "static-cache")
	
	// Check if cache directory exists
	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		fmt.Println("Cache directory doesn't exist, nothing to clear")
		return nil
	}
	
	// Get cache size before clearing
	var totalSize int64
	err := filepath.WalkDir(cacheDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				totalSize += info.Size()
			}
		}
		return nil
	})
	
	if err != nil {
		fmt.Printf("Error calculating cache size: %v\n", err)
	}
	
	// Remove all files in cache directory
	err = os.RemoveAll(cacheDir)
	if err != nil {
		return fmt.Errorf("failed to clear cache: %v", err)
	}
	
	// Recreate empty cache directory
	err = os.MkdirAll(cacheDir, 0755)
	if err != nil {
		return fmt.Errorf("failed to recreate cache directory: %v", err)
	}
	
	fmt.Printf("Cache cleared successfully. Freed %d bytes (%.2f MB)\n", totalSize, float64(totalSize)/(1024*1024))
	return nil
}

// GetCacheInfo returns information about the audio cache
func (a *App) GetCacheInfo() (map[string]interface{}, error) {
	cacheDir := filepath.Join(os.TempDir(), "static-cache")
	
	info := map[string]interface{}{
		"path":      cacheDir,
		"exists":    false,
		"fileCount": 0,
		"totalSize": int64(0),
		"sizeMB":    0.0,
	}
	
	// Check if cache directory exists
	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		return info, nil
	}
	
	info["exists"] = true
	
	// Count files and calculate total size
	var fileCount int
	var totalSize int64
	
	err := filepath.WalkDir(cacheDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			fileCount++
			fileInfo, err := d.Info()
			if err == nil {
				totalSize += fileInfo.Size()
			}
		}
		return nil
	})
	
	if err != nil {
		return info, fmt.Errorf("error reading cache directory: %v", err)
	}
	
	info["fileCount"] = fileCount
	info["totalSize"] = totalSize
	info["sizeMB"] = float64(totalSize) / (1024 * 1024)
	
	return info, nil
}

// TestDiscordRPC tests Discord RPC connection and returns status
func (a *App) TestDiscordRPC() map[string]interface{} {
	result := map[string]interface{}{
		"enabled":   a.settings.DiscordRPC,
		"connected": a.discordActive,
		"message":   "",
	}
	
	if !a.settings.DiscordRPC {
		result["message"] = "Discord RPC is disabled in settings"
		return result
	}
	
	if !a.discordActive {
		result["message"] = "Discord RPC is not connected. Make sure Discord is running."
		// Try to reconnect
		go a.initDiscordRPC()
		return result
	}
	
	// Test by setting a simple activity
	err := client.SetActivity(client.Activity{
		State:   "Testing connection",
		Details: "Discord RPC Test",
	})
	
	if err != nil {
		result["connected"] = false
		result["message"] = fmt.Sprintf("Connection test failed: %v", err)
		a.discordActive = false
	} else {
		result["message"] = "Discord RPC is working correctly"
	}
	
	return result
}

// GetDiscordRPCStatus returns the current Discord RPC status
func (a *App) GetDiscordRPCStatus() map[string]interface{} {
	return map[string]interface{}{
		"enabled":       a.settings.DiscordRPC,
		"connected":     a.discordActive,
		"applicationId": "1418623365631181003",
	}
}
func (a *App) ScanPlaylistFiles(playlistPath string) (map[string][]string, error) {
	result := map[string][]string{
		"musics": {},
		"covers": {},
	}

	musicsDir := filepath.Join(playlistPath, "musics")
	coversDir := filepath.Join(playlistPath, "covers")

	// Scan music files
	if _, err := os.Stat(musicsDir); err == nil {
		err := filepath.WalkDir(musicsDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !d.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".mp3" || ext == ".wav" || ext == ".ogg" || ext == ".m4a" || ext == ".flac" {
					relPath, _ := filepath.Rel(musicsDir, path)
					result["musics"] = append(result["musics"], relPath)
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	// Scan cover files
	if _, err := os.Stat(coversDir); err == nil {
		err := filepath.WalkDir(coversDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !d.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" {
					relPath, _ := filepath.Rel(coversDir, path)
					result["covers"] = append(result["covers"], relPath)
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	return result, nil
}
// Cleanup shuts down the cover art server gracefully
func (a *App) Cleanup() {
	if a.coverServer != nil {
		fmt.Println("Shutting down cover art server...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		if err := a.coverServer.Shutdown(ctx); err != nil {
			fmt.Printf("Error shutting down cover server: %v\n", err)
		} else {
			fmt.Println("Cover art server shut down successfully")
		}
	}
}
// GetCoverServerInfo returns information about the cover server for debugging
func (a *App) GetCoverServerInfo() map[string]interface{} {
	a.coverMutex.RLock()
	coverURL := a.currentCoverURL
	a.coverMutex.RUnlock()
	
	a.cacheMutex.RLock()
	cacheSize := len(a.coverCache)
	a.cacheMutex.RUnlock()
	
	return map[string]interface{}{
		"port":         a.coverServerPort,
		"running":      a.coverServer != nil,
		"coverURL":     coverURL,
		"hasSong":      a.currentSong != nil,
		"hasCover":     a.currentSong != nil && a.currentSong.CoverData != "",
		"testURL":      fmt.Sprintf("http://localhost:%d/test", a.coverServerPort),
		"cacheSize":    cacheSize,
		"usingImgur":   strings.Contains(coverURL, "imgur.com") || strings.Contains(coverURL, "i.imgur.com"),
		"activityType": "Listening (type 2)",
	}
}