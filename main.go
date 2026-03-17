package main

import (
	"embed"
	"context"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	appService := NewApp()
	// v3 doesn't provide the v2-style startup(ctx) hook; run our init explicitly.
	appService.startup(context.Background())

	app := application.New(application.Options{
		Name:        "static",
		Description: "Static",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Static",
		Width:            1200,
		Height:           800,
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	// Ensure background services stop on exit.
	app.OnShutdown(func() {
		appService.Cleanup()
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
