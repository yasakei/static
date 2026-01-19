# Static

A cross-platform music player built with Wails, Go, and React. Features Discord Rich Presence, MPRIS support on Linux, audio effects, and playlist management.

## Features

- Cross-platform support (Linux, Windows, macOS)
- Discord Rich Presence integration with album art
- MPRIS media controls on Linux
- Audio effects (Nightcore, Bass Boost) via FFmpeg
- Playlist management with TOML configuration
- Cover art extraction and display
- System tray integration
- Customizable themes and settings

## Prerequisites

### Required Dependencies

1. **Go** (version 1.19 or later)
   ```bash
   # Ubuntu/Debian
   sudo apt install golang-go
   
   # Arch Linux
   sudo pacman -S go
   
   # macOS
   brew install go
   ```

2. **Node.js and npm** (for frontend)
   ```bash
   # Ubuntu/Debian
   sudo apt install nodejs npm
   
   # Arch Linux
   sudo pacman -S nodejs npm
   
   # macOS
   brew install node
   ```

3. **Wails CLI**
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```

### Optional Dependencies

1. **FFmpeg** (for audio effects)
   ```bash
   # Ubuntu/Debian
   sudo apt install ffmpeg
   
   # Arch Linux
   sudo pacman -S ffmpeg
   
   # macOS
   brew install ffmpeg
   ```

2. **Discord** (for Rich Presence features)
   - Download and install Discord from https://discord.com

## Building from Source

### 1. Clone the Repository
```bash
git clone <repository-url>
cd static
```

### 2. Install Dependencies
```bash
# Install Go dependencies
go mod tidy

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Development Build
For development with hot reload:
```bash
wails dev
```

This starts a development server with:
- Hot reload for frontend changes
- Go method access via browser at http://localhost:34115

### 4. Production Build
```bash
wails build
```

The built executable will be available at:
- Linux: `build/bin/static`
- Windows: `build/bin/static.exe`
- macOS: `build/bin/static.app`

### 5. Build Options
```bash
# Build for specific platform
wails build -platform linux/amd64
wails build -platform windows/amd64
wails build -platform darwin/amd64

# Build with compression
wails build -compress

# Build without frontend (if already built)
wails build -skipfrontend
```

## Installation

### System-wide Installation (Linux)

#### Method 1: Manual Installation
```bash
# Build the application
wails build

# Copy binary to system location
sudo cp build/bin/static /usr/local/bin/static

# Make it executable
sudo chmod +x /usr/local/bin/static

# Create desktop entry
sudo tee /usr/share/applications/static.desktop > /dev/null << EOF
[Desktop Entry]
Name=Static
Comment=Cross-platform music player with Discord integration
Exec=/usr/local/bin/static
Icon=audio-x-generic
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
MimeType=audio/mpeg;audio/mp4;audio/wav;audio/ogg;audio/flac;
EOF

# Update desktop database
sudo update-desktop-database
```

#### Method 2: Using Package Manager (if available)
```bash
# For distributions with package managers
# Create a .deb package (Ubuntu/Debian)
# Create a .rpm package (Fedora/RHEL)
# Create a PKGBUILD (Arch Linux)
```

### System-wide Installation (macOS)
```bash
# Build the application
wails build

# Copy to Applications folder
cp -r build/bin/static.app /Applications/Static.app
```

### System-wide Installation (Windows)
```bash
# Build the application
wails build

# Copy to Program Files (run as Administrator)
copy build\bin\static.exe "C:\Program Files\Static\static.exe"

# Create Start Menu shortcut
# Create Desktop shortcut
```

## Configuration

### Music Library Setup
1. Create a static folder in your home directory:
   ```bash
   mkdir -p ~/static
   ```

2. Organize your music in playlist folders:
   ```
   ~/static/
   ├── My Playlist/
   │   ├── playlist.toml
   │   ├── cover.jpg (optional)
   │   └── musics/
   │       ├── song1.mp3
   │       ├── song2.mp3
   │       └── ...
   └── Another Playlist/
       ├── playlist.toml
       └── musics/
           └── ...
   ```

3. Create playlist.toml files:
   ```toml
   name = "My Awesome Playlist"
   description = "Collection of my favorite songs"
   cover = "cover.jpg"
   ```

### Discord Rich Presence Setup
1. Ensure Discord is running
2. Enable Discord RPC in application settings
3. The application will automatically show:
   - Currently playing song
   - Artist and album information
   - Album artwork (uploaded to Imgur)
   - Play/pause status
   - Song progress

## Usage

### Running the Application
```bash
# If installed system-wide
static

# If running from build directory
./build/bin/static
```

### Command Line Options
```bash
# Run in development mode
wails dev

# Build for production
wails build

# Clean build cache
wails build -clean
```

## Troubleshooting

### Build Issues
1. **Missing dependencies**: Run `go mod tidy` to install Go dependencies
2. **Frontend build fails**: Check Node.js version and run `npm install` in frontend directory
3. **Wails not found**: Ensure Wails CLI is installed and in PATH

### Runtime Issues
1. **Discord RPC not working**: Ensure Discord is running and RPC is enabled
2. **Audio effects not working**: Install FFmpeg
3. **No playlists found**: Check static folder path in settings
4. **MPRIS not working**: Linux only feature, ensure D-Bus is running

### Performance Issues
1. **Slow startup**: Clear audio cache in settings
2. **High memory usage**: Reduce number of cached covers
3. **Audio stuttering**: Disable audio effects or check FFmpeg installation

## Development

### Project Structure
```
.
├── app.go              # Main Go backend
├── main.go             # Application entry point
├── wails.json          # Wails configuration
├── go.mod              # Go dependencies
├── frontend/           # React frontend
│   ├── src/
│   ├── package.json
│   └── ...
└── build/              # Build output
```

### Adding Features
1. Backend: Add methods to `app.go`
2. Frontend: Update React components in `frontend/src/`
3. Rebuild: Run `wails build`

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Add your license information here]

## Support

For issues and support:
1. Check the troubleshooting section
2. Search existing issues
3. Create a new issue with detailed information
