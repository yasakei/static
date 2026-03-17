import { useState, useEffect, useRef } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  Settings,
  X,
  Sun,
  Moon,
  Heart,
  Cat,
  Disc3,
  ListMusic,
  Shuffle,
  Repeat,
  Repeat1,
  Mic2,
  Sparkles,
  Zap,
  Radio,
  Headphones,
  Album,
  Clock,
  MoreHorizontal,
  Plus,
  Trash2,
  Check
} from 'lucide-react'
import { App as Backend } from "../bindings/static"

const LogPrint = (message) => {
  console.log(`[LOG] ${message}`)
}

const {
  GetPlaylists,
  GetSongFileURL,
  NotifyPlaybackState,
  UpdatePlaybackPosition,
  GetSettings,
  UpdateSettings,
  CheckFFmpegInstalled,
  ClearAudioCache,
  GetCacheInfo,
  UpdatePlaylistPosition,
  GetPlaylistPosition,
} = Backend

function App() {
  const [playlists, setPlaylists] = useState([])
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [currentSong, setCurrentSong] = useState(null)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const [dominantColor, setDominantColor] = useState('#166534') // default green-800
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [bassBoostEnabled, setBassBoostEnabled] = useState(false)
  const [nightcoreEnabled, setNightcoreEnabled] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(null)
  const [accentColor, setAccentColor] = useState('purple') // purple, blue, green, pink
  const [nightcoreProgress, setNightcoreProgress] = useState({})
  const [isProcessingNightcore, setIsProcessingNightcore] = useState(false)
  const [isCrossfading, setIsCrossfading] = useState(false)
  
  const audioRef = useRef(null)

  // Add debug logging for component state
  useEffect(() => {
    LogPrint('App component mounted')
    LogPrint(`Initial state - loading: ${loading}, playlists: ${playlists.length}`)
  }, [])

  // Apply bass boost when toggled
  useEffect(() => {
    // Bass boost is now handled server-side, so we reload the song
    // This is handled by the nightcore effect hook above
  }, [bassBoostEnabled])

  // Apply nightcore when toggled - reload current song with effect
  useEffect(() => {
    if (currentSong && currentSong.filePath) {
      LogPrint(`Effect toggled - nightcore: ${nightcoreEnabled}, bassBoost: ${bassBoostEnabled}`)
      // Reload the song with nightcore effect applied
      const reloadWithEffect = async () => {
        const audio = audioRef.current
        if (!audio) return
        
        const wasPlaying = isPlaying
        const currentTimeBackup = audio.currentTime
        
        try {
          LogPrint('Reloading song with effects...')
          // Get new audio with effect
          const dataURL = await GetSongFileURL(currentSong.filePath, selectedPlaylist?.nightcoreMode || false, bassBoostEnabled)
          
          audio.src = dataURL
          audio.load()
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Reload timeout')), 10000)
            const onCanPlay = () => {
              clearTimeout(timeout)
              audio.removeEventListener('canplay', onCanPlay)
              audio.removeEventListener('error', onError)
              resolve()
            }
            const onError = () => {
              clearTimeout(timeout)
              audio.removeEventListener('canplay', onCanPlay)
              audio.removeEventListener('error', onError)
              reject(new Error('Reload error'))
            }
            audio.addEventListener('canplay', onCanPlay)
            audio.addEventListener('error', onError)
          })
          
          // Restore position and playback state
          audio.currentTime = currentTimeBackup
          
          if (wasPlaying) {
            await audio.play()
            setIsPlaying(true)
          }
          
          LogPrint('Song reloaded with effects successfully')
        } catch (err) {
          LogPrint(`Error reloading with effect: ${err.message}`)
        }
      }
      
      reloadWithEffect()
    }
  }, [bassBoostEnabled]) // Only reload when bass boost changes, not nightcore
  
  // Color themes
  const colorThemes = {
    purple: {
      primary: '#8b5cf6',
      primaryHover: '#7c3aed',
      primaryDark: '#6d28d9',
      gradient: 'from-purple-600 to-purple-800'
    },
    blue: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      primaryDark: '#1d4ed8',
      gradient: 'from-blue-600 to-blue-800'
    },
    green: {
      primary: '#22c55e',
      primaryHover: '#16a34a',
      primaryDark: '#15803d',
      gradient: 'from-green-600 to-green-800'
    },
    pink: {
      primary: '#ec4899',
      primaryHover: '#db2777',
      primaryDark: '#be185d',
      gradient: 'from-pink-600 to-pink-800'
    }
  }

  const currentTheme = colorThemes[accentColor]

  const extractColor = (imageSrc) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = imageSrc
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          canvas.width = 100
          canvas.height = 100
          ctx.drawImage(img, 0, 0, 100, 100)
          
          const imageData = ctx.getImageData(0, 0, 100, 100)
          const data = imageData.data
          let r = 0, g = 0, b = 0, count = 0
          
          // Sample pixels
          for (let i = 0; i < data.length; i += 4) {
            // Skip very dark or very light pixels
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
            if (brightness > 20 && brightness < 235) {
              r += data[i]
              g += data[i + 1]
              b += data[i + 2]
              count++
            }
          }
          
          if (count > 0) {
            r = Math.floor((r / count) * 0.3)
            g = Math.floor((g / count) * 0.3)
            b = Math.floor((b / count) * 0.3)
            resolve(`rgb(${r}, ${g}, ${b})`)
          } else {
            resolve('#166534')
          }
        } catch (e) {
          console.error('Color extraction error:', e)
          resolve('#166534')
        }
      }
      
      img.onerror = () => {
        console.error('Image load error')
        resolve('#166534')
      }
    })
  }

  useEffect(() => {
    LogPrint('App useEffect triggered - loading playlists and settings')
    loadPlaylists()
    loadSettings()
    
    // Check if FFmpeg is available
    CheckFFmpegInstalled().then(available => {
      setFfmpegAvailable(available)
      if (!available) {
        LogPrint('FFmpeg not found. Audio effects will not work.')
      } else {
        LogPrint('FFmpeg is available')
      }
    }).catch(err => {
      LogPrint(`Error checking FFmpeg: ${err.message}`)
      setFfmpegAvailable(false)
    })
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      LogPrint('Audio ref is null in useEffect')
      return
    }

    LogPrint('Setting up audio event listeners')

    const updateTime = () => {
      const newTime = audio.currentTime
      setCurrentTime(newTime)
      
      // Update Discord RPC position every 3 seconds when playing for smoother progress
      if (isPlaying && Math.floor(newTime) % 3 === 0 && newTime > 0) {
        UpdatePlaybackPosition(newTime).catch(err => 
          LogPrint(`Discord position update error: ${err.message}`)
        )
      }
      
      // Add periodic logging to see if time is updating
      if (Math.floor(newTime) % 10 === 0 && newTime > 0) {
        LogPrint(`Time update: ${newTime.toFixed(1)}s / ${audio.duration?.toFixed(1)}s`)
      }
    }
    
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
        LogPrint(`Duration updated: ${audio.duration}s`)
      }
    }
    
    const handleEnded = () => {
      LogPrint('Audio ended - moving to next song')
      setIsPlaying(false)
      setCurrentTime(0)
      
      // Auto-advance to next song
      if (selectedPlaylist && selectedPlaylist.songs.length > 0) {
        const nextIndex = (currentSongIndex + 1) % selectedPlaylist.songs.length
        LogPrint(`Auto-advancing to next song: ${nextIndex + 1}/${selectedPlaylist.songs.length}`)
        playSong(selectedPlaylist.songs[nextIndex], nextIndex)
      } else {
        LogPrint('No playlist available for auto-advance')
      }
    }
    
    const handlePlay = () => {
      setIsPlaying(true)
      LogPrint('Audio play event fired')
    }
    
    const handlePause = () => {
      setIsPlaying(false)
      LogPrint('Audio pause event fired')
    }

    const handleLoadedMetadata = () => {
      updateDuration()
      LogPrint(`Audio metadata loaded - duration: ${audio.duration}, readyState: ${audio.readyState}`)
    }

    const handleTimeUpdate = () => {
      updateTime()
    }

    const handleCanPlay = () => {
      LogPrint(`Audio can play - readyState: ${audio.readyState}, duration: ${audio.duration}`)
    }

    const handleLoadStart = () => {
      LogPrint('Audio load started')
    }

    const handleLoadedData = () => {
      LogPrint('Audio data loaded')
    }

    // Add all event listeners
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('durationchange', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('loadeddata', handleLoadedData)

    // Initial checks
    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration)
      LogPrint(`Initial duration: ${audio.duration}`)
    }
    
    if (audio.currentTime) {
      setCurrentTime(audio.currentTime)
      LogPrint(`Initial current time: ${audio.currentTime}`)
    }

    LogPrint(`Audio element state - paused: ${audio.paused}, readyState: ${audio.readyState}, networkState: ${audio.networkState}`)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('durationchange', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('loadeddata', handleLoadedData)
      LogPrint('Audio event listeners removed')
    }
  }, [selectedPlaylist, currentSongIndex]) // Remove playSong from dependencies since it's now defined above

  const loadSettings = async () => {
    try {
      const settingsData = await GetSettings()
      if (settingsData) {
        setIsDark(settingsData.theme === 'dark')
        setVolume(settingsData.volume)
      }
    } catch (err) {
      console.error('Error loading settings:', err)
    }
  }

  const saveTheme = async (theme) => {
    try {
      const newSettings = { 
        theme, 
        volume, 
        discordRPC: true, 
        showNotifications: true, 
        autoPlay: true, 
        shuffle: false, 
        repeat: 'none', 
        staticFolder: '', 
        language: 'en', 
        accentColor: 'blue' 
      }
      await UpdateSettings(newSettings)
      setIsDark(theme === 'dark')
    } catch (err) {
      console.error('Error saving settings:', err)
    }
  }

  const loadCacheInfo = async () => {
    try {
      LogPrint('Loading cache info...')
      const info = await GetCacheInfo()
      setCacheInfo(info)
      LogPrint(`Cache info loaded: ${info.fileCount} files, ${info.sizeMB.toFixed(2)} MB`)
    } catch (err) {
      LogPrint(`Error loading cache info: ${err.message}`)
      // Set default cache info on error
      setCacheInfo({
        path: '/tmp/static-cache',
        exists: false,
        fileCount: 0,
        totalSize: 0,
        sizeMB: 0.0
      })
    }
  }

  const clearCache = async () => {
    try {
      LogPrint('Clearing audio cache...')
      await ClearAudioCache()
      await loadCacheInfo() // Refresh cache info
      LogPrint('Audio cache cleared successfully')
    } catch (err) {
      LogPrint(`Error clearing cache: ${err.message}`)
    }
  }

  const togglePlaylistNightcore = async (playlist) => {
    if (isProcessingNightcore) return
    
    setIsProcessingNightcore(true)
    const newNightcoreMode = !playlist.nightcoreMode
    
    try {
      LogPrint(`Toggling nightcore for playlist: ${playlist.name} to ${newNightcoreMode}`)
      
      // Update playlist nightcore mode
      playlist.nightcoreMode = newNightcoreMode
      
      if (newNightcoreMode) {
        // Process all songs in playlist
        for (let i = 0; i < playlist.songs.length; i++) {
          const song = playlist.songs[i]
          setNightcoreProgress(prev => ({
            ...prev,
            [playlist.name]: { current: i + 1, total: playlist.songs.length, songTitle: song.title }
          }))
          
          // Pre-process the song with nightcore
          await GetSongFileURL(song.filePath, true, false)
          LogPrint(`Processed ${i + 1}/${playlist.songs.length}: ${song.title}`)
        }
      }
      
      setNightcoreProgress(prev => ({ ...prev, [playlist.name]: null }))
      LogPrint(`Nightcore ${newNightcoreMode ? 'enabled' : 'disabled'} for playlist: ${playlist.name}`)
    } catch (err) {
      LogPrint(`Error toggling nightcore: ${err.message}`)
    } finally {
      setIsProcessingNightcore(false)
    }
  }

  // Remove Web Audio API setup - causes issues with time tracking
  // const setupAudioEffects = () => {
  //   // Effects are now handled server-side with FFmpeg
  // }

  // Crossfade effect
  const applyCrossfade = (fadeOut = false) => {
    if (!crossfadeEnabled) return Promise.resolve()
    
    const audio = audioRef.current
    if (!audio) return Promise.resolve()
    
    LogPrint(`Applying crossfade: ${fadeOut ? 'fade out' : 'fade in'}`)
    setIsCrossfading(true)
    
    return new Promise((resolve) => {
      // Simple volume-based crossfade
      if (fadeOut) {
        let currentVolume = audio.volume
        const fadeInterval = setInterval(() => {
          currentVolume -= 0.05 // Faster fade
          if (currentVolume <= 0) {
            audio.volume = 0
            clearInterval(fadeInterval)
            LogPrint('Fade out complete')
            setIsCrossfading(false)
            resolve()
          } else {
            audio.volume = Math.max(0, currentVolume)
          }
        }, 50) // 50ms intervals for smoother fade
      } else {
        audio.volume = 0
        let currentVolume = 0
        const targetVolume = volume // Use the React state volume, not hardcoded 1.0
        const fadeInterval = setInterval(() => {
          currentVolume += 0.05 // Faster fade
          if (currentVolume >= targetVolume) {
            audio.volume = targetVolume
            clearInterval(fadeInterval)
            LogPrint('Fade in complete')
            setIsCrossfading(false)
            resolve()
          } else {
            audio.volume = Math.min(targetVolume, currentVolume)
          }
        }, 50) // 50ms intervals for smoother fade
      }
    })
  }

  const loadPlaylists = async () => {
    try {
      LogPrint('Starting to load playlists...')
      setLoading(true)
      const playlistData = await GetPlaylists()
      LogPrint(`Received playlist data: ${JSON.stringify(playlistData)}`)
      setPlaylists(playlistData || [])
      if (playlistData && playlistData.length > 0) {
        const firstPlaylist = playlistData[0]
        setSelectedPlaylist(firstPlaylist)
        
        // Auto-start from saved position if available
        if (firstPlaylist.songs && firstPlaylist.songs.length > 0) {
          const startPosition = firstPlaylist.position || 0
          if (startPosition >= 0 && startPosition < firstPlaylist.songs.length) {
            setCurrentSongIndex(startPosition)
            LogPrint(`Auto-loaded playlist position: ${startPosition}`)
          }
        }
        
        LogPrint(`Selected first playlist: ${firstPlaylist.name}`)
      } else {
        LogPrint('No playlists found')
      }
    } catch (err) {
      LogPrint(`Error loading playlists: ${err.message}`)
      console.error('Error loading playlists:', err)
    } finally {
      LogPrint('Setting loading to false')
      setLoading(false)
    }
  }

  const playSong = async (song, index) => {
    LogPrint(`playSong called: ${song.title}`)
    
    try {
      const audio = audioRef.current
      
      // Fade out current song if crossfade enabled and something is playing
      if (crossfadeEnabled && currentSong && isPlaying) {
        LogPrint('Starting crossfade fade out')
        await applyCrossfade(true)
        LogPrint('Crossfade fade out completed')
      }
      
      // Immediately stop current playback
      if (audio) {
        audio.pause()
        audio.currentTime = 0
        setCurrentTime(0)
        setDuration(0)
      }
      
      setIsPlaying(false)

      LogPrint('Getting song file URL...')
      const dataURL = await GetSongFileURL(song.filePath, selectedPlaylist?.nightcoreMode || false, bassBoostEnabled)
      LogPrint(`Got data URL, length: ${dataURL.length}`)
      
      setCurrentSong({ ...song, dataURL })
      setCurrentSongIndex(index)
      
      // Save the position to playlist.toml
      if (selectedPlaylist && selectedPlaylist.folderPath) {
        try {
          await UpdatePlaylistPosition(selectedPlaylist.folderPath, index)
          LogPrint(`Saved playlist position: ${index}`)
          // Update the local playlist state
          setSelectedPlaylist(prev => ({ ...prev, position: index }))
        } catch (err) {
          LogPrint(`Error saving playlist position: ${err.message}`)
        }
      }
      
      if (audio) {
        LogPrint('Setting audio source...')
        audio.src = dataURL
        
        // Add event handlers for this specific load
        const onLoadedMetadata = () => {
          LogPrint(`Metadata loaded - duration: ${audio.duration}`)
          if (audio.duration && !isNaN(audio.duration)) {
            setDuration(audio.duration)
          }
          // Force a time update
          setCurrentTime(audio.currentTime || 0)
        }
        
        const onError = (e) => {
          LogPrint(`Audio error: ${audio.error?.message || 'Unknown error'}`)
        }

        const onTimeUpdate = () => {
          setCurrentTime(audio.currentTime)
        }
        
        audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
        audio.addEventListener('error', onError, { once: true })
        audio.addEventListener('timeupdate', onTimeUpdate)
        
        audio.load()
        
        // Set initial volume
        if (!crossfadeEnabled) {
          audio.volume = volume
        }
        
        LogPrint('Waiting for audio to load...')
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            LogPrint('Audio load timeout')
            reject(new Error('Load timeout'))
          }, 10000)
          
          const onCanPlay = () => {
            LogPrint('Audio can play - resolving')
            clearTimeout(timeout)
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('error', onLoadError)
            resolve()
          }
          
          const onLoadError = (e) => {
            LogPrint(`Audio load error: ${audio.error?.message || 'Unknown'}`)
            clearTimeout(timeout)
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('error', onLoadError)
            reject(new Error('Load error'))
          }
          
          audio.addEventListener('canplay', onCanPlay)
          audio.addEventListener('error', onLoadError)
        })
        
        LogPrint('Playing audio...')
        try {
          await audio.play()
          LogPrint('Audio playing successfully')
          setIsPlaying(true)
          
          // Force initial time update
          setCurrentTime(audio.currentTime)
          LogPrint(`Initial playback time: ${audio.currentTime}`)
          
          // Fade in new song if crossfade enabled
          if (crossfadeEnabled) {
            LogPrint('Starting crossfade fade in')
            await applyCrossfade(false)
            LogPrint('Crossfade fade in completed')
          }
        } catch (playError) {
          LogPrint(`Play error: ${playError.message}`)
          throw playError
        }
        
        NotifyPlaybackState(song, true).catch(err => LogPrint(`Notify error: ${err.message}`))
      }

      // Extract color asynchronously without blocking playback
      if (song.coverData) {
        extractColor(song.coverData).then(color => {
          setDominantColor(color)
        }).catch((err) => {
          LogPrint(`Color extraction failed: ${err.message}`)
          setDominantColor('#166534')
        })
      } else {
        setDominantColor('#166534')
      }
    } catch (err) {
      LogPrint(`Error playing song: ${err.message}`)
      setIsPlaying(false)
    }
  }

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio || !currentSong) return

    LogPrint(`Toggle play/pause - current state: ${isPlaying ? 'playing' : 'paused'}`)
    
    if (isPlaying) {
      // Immediately pause
      audio.pause()
      setIsPlaying(false)
      LogPrint('Paused audio')
      NotifyPlaybackState(currentSong, false).catch(err => LogPrint(`Notify error: ${err.message}`))
      // Update Discord RPC immediately with current position
      UpdatePlaybackPosition(audio.currentTime).catch(err => LogPrint(`Discord update error: ${err.message}`))
    } else {
      // Immediately play
      audio.play().then(() => {
        setIsPlaying(true)
        LogPrint('Started playing audio')
        NotifyPlaybackState(currentSong, true).catch(err => LogPrint(`Notify error: ${err.message}`))
        // Update Discord RPC immediately with current position
        UpdatePlaybackPosition(audio.currentTime).catch(err => LogPrint(`Discord update error: ${err.message}`))
      }).catch(err => {
        LogPrint(`Play error: ${err.message}`)
        setIsPlaying(false)
      })
    }
  }

  const nextSong = () => {
    if (!selectedPlaylist || !selectedPlaylist.songs.length) {
      LogPrint('No playlist or songs available for next song')
      return
    }
    
    const nextIndex = (currentSongIndex + 1) % selectedPlaylist.songs.length
    LogPrint(`Moving to next song: ${nextIndex + 1}/${selectedPlaylist.songs.length}`)
    playSong(selectedPlaylist.songs[nextIndex], nextIndex)
  }

  const previousSong = () => {
    if (!selectedPlaylist || !selectedPlaylist.songs.length) {
      LogPrint('No playlist or songs available for previous song')
      return
    }
    
    const prevIndex = currentSongIndex === 0 ? selectedPlaylist.songs.length - 1 : currentSongIndex - 1
    LogPrint(`Moving to previous song: ${prevIndex + 1}/${selectedPlaylist.songs.length}`)
    playSong(selectedPlaylist.songs[prevIndex], prevIndex)
  }

  const seekTo = (e) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const newTime = percent * duration
    
    LogPrint(`Seeking to: ${newTime}s (${percent * 100}%)`)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const changeVolume = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current && !isCrossfading) {
      // Don't interfere with crossfade volume changes
      audioRef.current.volume = newVolume
    }
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (loading) {
    LogPrint('Rendering loading screen')
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#070A0F] text-white">
        {/* Animated logo container */}
        <div className="relative mb-8">
          {/* Outer ring */}
          <div 
            className="w-24 h-24 rounded-full border-2 border-neutral-800 flex items-center justify-center relative"
          >
            {/* Spinning accent ring */}
            <div 
              className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${currentTheme.primary} transparent ${currentTheme.primary} transparent` }}
            ></div>
            
            {/* Inner disc */}
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center relative overflow-hidden"
              style={{ backgroundColor: currentTheme.primary }}
            >
              {/* Rotating disc icon */}
              <Disc3 className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
              
              {/* Subtle shine effect */}
              <div className="absolute top-0 right-0 w-8 h-8 bg-white/10 rounded-full blur-sm"></div>
            </div>
          </div>
          
          {/* Orbiting dots */}
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-2 h-2 rounded-full bg-white"></div>
          </div>
        </div>
        
        {/* App name */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            <span className="text-white">static</span>
            <span style={{ color: currentTheme.primary }}>.</span>
          </h1>
          
          {/* Loading indicator */}
          <div className="flex items-center gap-1.5 justify-center">
            <span className="text-sm text-neutral-500">Loading</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
          
          {/* Status text */}
          <p className="text-xs text-neutral-600 mt-4">Preparing your music</p>
        </div>
        
        {/* Bottom progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900">
          <div 
            className="h-full animate-pulse"
            style={{ 
              width: '30%',
              backgroundColor: currentTheme.primary,
              animation: 'loading-pulse 1.5s ease-in-out infinite'
            }}
          ></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDark ? 'bg-[#070A0F] text-white' : 'bg-white text-black'}`}>
      <audio ref={audioRef} />

      {/* Main Content */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left Sidebar */}
        <div className={`w-72 rounded-xl p-5 flex flex-col gap-6 border ${isDark ? 'bg-[#0F1115] border-[#1A1D23]' : 'bg-gray-50 border-gray-200'}`}>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg relative overflow-hidden"
              style={{ backgroundColor: currentTheme.primary }}
            >
              <Sparkles className="w-5 h-5 text-white/80 absolute top-1 right-1" />
              <Disc3 className="w-6 h-6 text-white relative z-10" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">Static</span>
              <div className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>Music Player</div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <ListMusic className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>Library</h2>
            </div>
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
              {playlists.map((playlist, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setSelectedPlaylist(playlist)
                    if (playlist.songs && playlist.songs.length > 0) {
                      const savedPosition = playlist.position || 0
                      if (savedPosition >= 0 && savedPosition < playlist.songs.length) {
                        setCurrentSongIndex(savedPosition)
                        LogPrint(`Loaded saved position for ${playlist.name}: ${savedPosition}`)
                      } else {
                        setCurrentSongIndex(0)
                      }
                    }
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all group ${
                    selectedPlaylist?.name === playlist.name
                      ? (isDark ? 'bg-[#1A1D23]' : 'bg-gray-200')
                      : (isDark ? 'hover:bg-[#15181E]' : 'hover:bg-gray-100')
                  }`}
                >
                  {/* Playlist Artwork */}
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-200'}`}>
                    {playlist.coverData ? (
                      <img src={playlist.coverData} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : playlist.songs[0]?.coverData ? (
                      <img src={playlist.songs[0].coverData} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusic className={`w-5 h-5 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-black'}`}>{playlist.name}</div>
                    <div className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{playlist.songs.length} songs</div>
                  </div>
                  {selectedPlaylist?.name === playlist.name && (
                    <Check className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              LogPrint('Settings button clicked')
              setShowSettings(true)
              if (!cacheInfo) {
                loadCacheInfo()
              }
            }}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isDark ? 'text-neutral-400 hover:text-white hover:bg-[#1A1D23]' : 'text-neutral-600 hover:text-black hover:bg-gray-100'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 rounded-xl overflow-hidden flex flex-col border ${isDark ? 'bg-[#0F1115] border-[#1A1D23]' : 'bg-white border-gray-200'}`}>
          {selectedPlaylist ? (
            <>
              {/* Playlist Header */}
              <div className={`p-6 border-b ${isDark ? 'border-[#1A1D23]' : 'border-gray-100'}`}>
                <div className="flex items-center gap-5">
                  <div className={`w-32 h-32 rounded-xl shadow-2xl flex items-center justify-center flex-shrink-0 overflow-hidden ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
                    {selectedPlaylist.coverData ? (
                      <img src={selectedPlaylist.coverData} alt={selectedPlaylist.name} className="w-full h-full object-cover" />
                    ) : selectedPlaylist.songs[0]?.coverData ? (
                      <img src={selectedPlaylist.songs[0].coverData} alt={selectedPlaylist.name} className="w-full h-full object-cover" />
                    ) : (
                      <Album className={`w-14 h-14 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>Playlist</div>
                    <h1 className={`text-4xl font-black mb-3 truncate ${isDark ? 'text-white' : 'text-black'}`}>{selectedPlaylist.name}</h1>
                    <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      <span className="flex items-center gap-1.5">
                        <ListMusic className="w-4 h-4" />
                        {selectedPlaylist.songs.length} songs
                      </span>
                      {selectedPlaylist.description && (
                        <>
                          <span>•</span>
                          <span className="truncate">{selectedPlaylist.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className={`px-6 py-4 flex items-center gap-4 border-b ${isDark ? 'border-[#1A1D23] bg-[#0F1115]' : 'border-gray-100 bg-white'}`}>
                <button
                  onClick={() => {
                    if (selectedPlaylist.songs.length > 0) {
                      const startPosition = selectedPlaylist.position || 0
                      const validPosition = startPosition >= 0 && startPosition < selectedPlaylist.songs.length ? startPosition : 0
                      playSong(selectedPlaylist.songs[validPosition], validPosition)
                    }
                  }}
                  className="w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg"
                  style={{ backgroundColor: currentTheme.primary }}
                >
                  {isPlaying && currentSong ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-0.5" />
                  )}
                </button>
                
                <button
                  onClick={() => togglePlaylistNightcore(selectedPlaylist)}
                  className={`transition-all duration-200 ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}
                  title="Toggle Nightcore Mode for Playlist"
                >
                  {isProcessingNightcore ? (
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                      selectedPlaylist.nightcoreMode
                        ? 'text-pink-500 bg-pink-500/10 hover:bg-pink-500/20'
                        : 'hover:bg-neutral-500/10'
                    }`}>
                      <Cat className="w-5 h-5" />
                    </div>
                  )}
                </button>

                <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
                  <Zap className={`w-4 h-4 ${selectedPlaylist.nightcoreMode ? 'text-pink-500' : (isDark ? 'text-neutral-500' : 'text-neutral-400')}`} />
                  <span className={`text-sm font-medium ${selectedPlaylist.nightcoreMode ? 'text-pink-500' : (isDark ? 'text-neutral-400' : 'text-neutral-500')}`}>
                    {selectedPlaylist.nightcoreMode ? 'Nightcore Mode Active' : 'Nightcore Mode Off'}
                  </span>
                </div>
              </div>

              {/* Nightcore Progress Bar */}
              {nightcoreProgress[selectedPlaylist?.name] && (
                <div className="px-4 py-3 bg-purple-900/20 border-t border-purple-500/30">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm text-purple-300 font-medium">
                      Processing Nightcore Mode...
                    </div>
                  </div>
                  <div className="text-xs text-purple-200 mb-2">
                    {nightcoreProgress[selectedPlaylist.name].current}/{nightcoreProgress[selectedPlaylist.name].total} - {nightcoreProgress[selectedPlaylist.name].songTitle}
                  </div>
                  <div className="w-full bg-purple-900/50 rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(nightcoreProgress[selectedPlaylist.name].current / nightcoreProgress[selectedPlaylist.name].total) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Song List */}
              <div className="flex-1 overflow-y-auto">
                <div className={`grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-6 py-3 text-xs font-bold uppercase tracking-wider border-b sticky top-0 ${
                  isDark
                    ? 'text-neutral-500 border-[#1A1D23] bg-[#0F1115]'
                    : 'text-neutral-500 border-gray-100 bg-white'
                }`}>
                  <div className="w-8 text-center">#</div>
                  <div>Title</div>
                  <div>Album</div>
                  <div className="pr-8"><Clock className="w-4 h-4 ml-auto" /></div>
                </div>

                {selectedPlaylist.songs.map((song, index) => (
                  <div
                    key={index}
                    onClick={() => playSong(song, index)}
                    className={`grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-6 py-3 mx-4 rounded-lg cursor-pointer group transition-all ${
                      currentSong?.title === song.title
                        ? (isDark ? 'bg-[#1A1D23]' : 'bg-gray-100')
                        : (isDark ? 'hover:bg-[#15181E]' : 'hover:bg-gray-50')
                    }`}
                  >
                    <div className={`flex items-center justify-center w-8 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      {currentSong?.title === song.title && isPlaying ? (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></span>
                          <span className="w-1 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></span>
                          <span className="w-1 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                        </div>
                      ) : (
                        <>
                          <span className="group-hover:hidden font-medium">{index + 1}</span>
                          <Play className={`w-4 h-4 hidden group-hover:block ${isDark ? 'text-white' : 'text-black'}`} />
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
                        {song.coverData ? (
                          <img src={song.coverData} alt={song.title} className="w-full h-full object-cover" />
                        ) : (
                          <Music className={`w-5 h-5 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium truncate ${currentSong?.title === song.title ? 'text-green-500' : (isDark ? 'text-white' : 'text-black')}`}>
                          {song.title}
                        </div>
                        <div className={`text-sm truncate ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{song.artist}</div>
                      </div>
                    </div>

                    <div className={`flex items-center text-sm truncate ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                      {selectedPlaylist.name}
                    </div>

                    <div className={`flex items-center justify-end text-sm font-mono ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                      {song.duration}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className={`w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
                  <Radio className={`w-10 h-10 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                </div>
                <p className={`text-lg font-medium ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Select a playlist</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>Choose from your library to start playing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Player Bar */}
      {currentSong && (
        <div className={`h-20 border-t px-4 flex items-center gap-4 ${
          isDark
            ? 'bg-[#0F1115] border-[#1A1D23]'
            : 'bg-white border-gray-200'
        }`}>
          {/* Song Info */}
          <div className="w-72 flex items-center gap-3">
            <div className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
              {currentSong.coverData ? (
                <img src={currentSong.coverData} alt={currentSong.title} className="w-full h-full object-cover" />
              ) : (
                <Music className={`w-6 h-6 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-black'}`}>{currentSong.title}</div>
              <div className={`text-xs truncate ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{currentSong.artist}</div>
            </div>
            <button className={`transition-colors ${isDark ? 'text-neutral-500 hover:text-red-500' : 'text-neutral-400 hover:text-red-500'}`}>
              <Heart className="w-5 h-5" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <button onClick={previousSong} className={`transition-colors ${isDark ? 'text-neutral-500 hover:text-white' : 'text-neutral-400 hover:text-black'}`}>
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlayPause}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                style={{ backgroundColor: currentTheme.primary }}
              >
                {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
              </button>
              <button onClick={nextSong} className={`transition-colors ${isDark ? 'text-neutral-500 hover:text-white' : 'text-neutral-400 hover:text-black'}`}>
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 w-full max-w-2xl">
              <span className={`text-xs w-10 text-right font-mono ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{formatTime(currentTime)}</span>
              <div
                className={`flex-1 h-1.5 rounded-full cursor-pointer group ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-200'}`}
                onClick={seekTo}
              >
                <div
                  className="h-full rounded-full relative transition-all"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%`, backgroundColor: currentTheme.primary }}
                >
                  <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"></div>
                </div>
              </div>
              <span className={`text-xs w-10 font-mono ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="w-32 flex items-center gap-2">
            <button onClick={() => setVolume(volume === 0 ? 0.7 : 0)} className={`${isDark ? 'text-neutral-500 hover:text-white' : 'text-neutral-400 hover:text-black'}`}>
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className={`flex-1 h-1.5 rounded-full relative group ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-200'}`}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${volume * 100}%`, backgroundColor: currentTheme.primary }}
              ></div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={changeVolume}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`rounded-2xl p-8 w-[520px] max-h-[85vh] overflow-y-auto shadow-2xl border ${isDark ? 'bg-[#0F1115] border-[#1A1D23]' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-[#1A1D23]' : 'bg-gray-100'}`}>
                  <Settings className={`w-5 h-5 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`} />
                </div>
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>Settings</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className={`transition-colors p-2 rounded-lg ${isDark ? 'text-neutral-500 hover:text-white hover:bg-[#1A1D23]' : 'text-neutral-400 hover:text-black hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Theme */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <label className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Appearance</label>
                </div>

                {/* Dark/Light Mode */}
                <div className="mb-5">
                  <div className={`text-sm mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Theme Mode</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveTheme('dark')}
                      className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border ${
                        isDark
                          ? 'text-white shadow-lg'
                          : 'bg-gray-50 text-neutral-600 hover:bg-gray-100 border-gray-200'
                      }`}
                      style={isDark ? { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary } : {}}
                    >
                      <Moon className="w-4 h-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => saveTheme('light')}
                      className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border ${
                        !isDark
                          ? 'text-white shadow-lg'
                          : 'bg-gray-50 text-neutral-600 hover:bg-gray-100 border-gray-200'
                      }`}
                      style={!isDark ? { backgroundColor: currentTheme.primary, borderColor: currentTheme.primary } : {}}
                    >
                      <Sun className="w-4 h-4" />
                      Light
                    </button>
                  </div>
                </div>

                {/* Accent Colors */}
                <div>
                  <div className={`text-sm mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Accent Color</div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(colorThemes).map(([color, theme]) => (
                      <button
                        key={color}
                        onClick={() => setAccentColor(color)}
                        className={`aspect-square rounded-xl transition-all border-2 ${
                          accentColor === color ? 'border-white scale-105' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: theme.primary }}
                      >
                        <div className="w-full h-full rounded-xl flex items-center justify-center">
                          {accentColor === color && <Check className="w-5 h-5 text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio Effects */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Headphones className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <label className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Audio Effects</label>
                </div>

                {!ffmpegAvailable && (
                  <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                    <div className="text-yellow-500 text-sm font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      FFmpeg Required
                    </div>
                    <div className="text-yellow-500/70 text-xs mt-1">
                      Install FFmpeg to enable audio effects. Visit ffmpeg.org for installation instructions.
                    </div>
                  </div>
                )}

                {/* Crossfade */}
                <div className={`flex items-center justify-between p-4 rounded-xl mb-3 border ${isDark ? 'bg-[#1A1D23] border-[#252830]' : 'bg-gray-50 border-gray-200'}`}>
                  <div>
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-black'}`}>Crossfade</div>
                    <div className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>Smooth transitions between songs</div>
                  </div>
                  <button
                    onClick={() => setCrossfadeEnabled(!crossfadeEnabled)}
                    className={`w-12 h-6 rounded-full transition-all relative ${
                      crossfadeEnabled ? 'shadow-lg' : (isDark ? 'bg-[#252830]' : 'bg-gray-300')
                    }`}
                    style={crossfadeEnabled ? { backgroundColor: currentTheme.primary } : {}}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                      crossfadeEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}></div>
                  </button>
                </div>

                {/* Bass Boost */}
                <div className={`flex items-center justify-between p-4 rounded-xl border ${
                  ffmpegAvailable 
                    ? (isDark ? 'bg-[#1A1D23] border-[#252830]' : 'bg-gray-50 border-gray-200') 
                    : (isDark ? 'bg-[#1A1D23]/50 border-[#252830]/50' : 'bg-gray-50 border-gray-200')
                }`}>
                  <div>
                    <div className={`font-medium ${ffmpegAvailable ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-neutral-600' : 'text-neutral-400')}`}>Bass Boost</div>
                    <div className={`text-xs ${ffmpegAvailable ? (isDark ? 'text-neutral-500' : 'text-neutral-500') : (isDark ? 'text-neutral-600' : 'text-neutral-400')}`}>Enhanced low frequencies (+10dB @ 200Hz)</div>
                  </div>
                  <button
                    onClick={() => ffmpegAvailable && setBassBoostEnabled(!bassBoostEnabled)}
                    disabled={!ffmpegAvailable}
                    className={`w-12 h-6 rounded-full transition-all relative ${
                      bassBoostEnabled && ffmpegAvailable ? 'shadow-lg' : (isDark ? 'bg-[#252830]' : 'bg-gray-300')
                    } ${!ffmpegAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={bassBoostEnabled && ffmpegAvailable ? { backgroundColor: currentTheme.primary } : {}}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                      bassBoostEnabled && ffmpegAvailable ? 'translate-x-6' : 'translate-x-0.5'
                    }`}></div>
                  </button>
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Disc3 className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <label className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Storage</label>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#1A1D23] border-[#252830]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-black'}`}>Audio Effects Cache</div>
                    <button
                      onClick={clearCache}
                      disabled={!cacheInfo}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                        cacheInfo 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : (isDark ? 'bg-[#252830] text-neutral-500' : 'bg-gray-200 text-neutral-400') + ' cursor-not-allowed'
                      }`}
                    >
                      Clear Cache
                    </button>
                  </div>
                  <div className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {cacheInfo ? (
                      cacheInfo.exists ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{cacheInfo.path}</span>
                          <span>•</span>
                          <span>{cacheInfo.fileCount} files</span>
                          <span>•</span>
                          <span>{cacheInfo.sizeMB.toFixed(2)} MB</span>
                        </div>
                      ) : (
                        'No cache files found'
                      )
                    ) : (
                      'Loading cache info...'
                    )}
                  </div>
                </div>
              </div>

              {/* Debug */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MoreHorizontal className={`w-4 h-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <label className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Debug</label>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#1A1D23] border-[#252830]' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${isDark ? 'text-white' : 'text-black'}`}>Cover Art Server</div>
                      <div className={`text-xs mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>Test the local cover art server</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const info = await Backend.GetCoverServerInfo()
                          LogPrint(`Cover Server Info: ${JSON.stringify(info, null, 2)}`)

                          if (info.testURL) {
                            fetch(info.testURL)
                              .then(response => response.text())
                              .then(text => LogPrint(`Server test response: ${text}`))
                              .catch(err => LogPrint(`Server test failed: ${err.message}`))
                          }
                        } catch (err) {
                          LogPrint(`Debug error: ${err.message}`)
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-all"
                    >
                      Test Server
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App