import { useState, useEffect, useRef } from 'react'
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Music,
  Settings,
  X,
  Sun,
  Moon,
  Heart,
  ChevronLeft,
  ChevronRight,
  Cat
} from 'lucide-react'
import { GetPlaylists, GetSongFileURL, NotifyPlaybackState, UpdatePlaybackPosition, GetSettings, UpdateSettings, CheckFFmpegInstalled, ClearAudioCache, GetCacheInfo, UpdatePlaylistPosition, GetPlaylistPosition } from '../wailsjs/go/main/App'
import { LogPrint as WailsLogPrint } from '../wailsjs/runtime/runtime'

// Fallback for development mode
const LogPrint = (message) => {
  if (typeof WailsLogPrint === 'function') {
    WailsLogPrint(message)
  } else {
    console.log(`[LOG] ${message}`)
  }
}

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
    return (
      <div className="h-screen bg-black text-green-400 font-mono flex items-center justify-center">
        <div className="text-center">
          <div className="text-green-300 text-sm mb-4">
            user@static:~$ initializing audio system...
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <span className="animate-pulse">Loading</span>
            <span className="animate-pulse" style={{animationDelay: '0.2s'}}>.</span>
            <span className="animate-pulse" style={{animationDelay: '0.4s'}}>.</span>
            <span className="animate-pulse" style={{animationDelay: '0.6s'}}>.</span>
          </div>
          <div className="text-green-600 text-xs mt-2">
            [████████████████████████████████] 100%
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    LogPrint('Rendering loading screen')
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 mx-auto mb-4 flex items-center justify-center animate-pulse">
            <Music className="w-8 h-8 text-white" />
          </div>
          <div className="text-xl font-semibold">Loading...</div>
          <div className="text-sm text-gray-400 mt-2">Scanning for playlists</div>
        </div>
      </div>
    )
  }

  // LogPrint(`Rendering main app - playlists: ${playlists.length}, selectedPlaylist: ${selectedPlaylist?.name || 'none'}`)

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500 mx-auto mb-4 flex items-center justify-center animate-pulse">
            <Music className="w-8 h-8 text-black" />
          </div>
          <div className="text-white text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDark ? 'bg-black text-white' : 'bg-white text-black'}`}>
      <audio ref={audioRef} />
      
      {/* Main Content */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        {/* Left Sidebar */}
        <div className={`w-64 rounded-lg p-6 flex flex-col gap-6 ${isDark ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg relative overflow-hidden group"
              style={{ backgroundColor: currentTheme.primary }}
            >
              {/* Animated background gradient */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(45deg, ${currentTheme.primary}, ${currentTheme.primaryHover}, ${currentTheme.primary})`
                }}
              ></div>
              
              {/* Sparkle effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute top-1 left-2 w-1 h-1 bg-white rounded-full animate-pulse"></div>
                <div className="absolute top-3 right-1 w-0.5 h-0.5 bg-white rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                <div className="absolute bottom-2 left-1 w-0.5 h-0.5 bg-white rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
              </div>
              
              <Music className="w-6 h-6 text-white relative z-10 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-neutral-300 bg-clip-text text-transparent">
              Static
            </span>
          </div>

          <div>
            <h2 className={`text-base font-semibold mb-4 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>Your Library</h2>
            <div className="space-y-2">
              {playlists.map((playlist, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setSelectedPlaylist(playlist)
                    // Set current song index to saved position
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
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all ${
                    selectedPlaylist?.name === playlist.name
                      ? (isDark ? 'bg-neutral-800' : 'bg-neutral-200')
                      : (isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200')
                  }`}
                >
                  {/* Playlist Artwork */}
                  <div className={`w-12 h-12 rounded flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-neutral-300'}`}>
                    {playlist.coverData ? (
                      <img 
                        src={playlist.coverData} 
                        alt={playlist.name} 
                        className="w-full h-full object-cover rounded" 
                      />
                    ) : playlist.songs[0]?.coverData ? (
                      <img 
                        src={playlist.songs[0].coverData} 
                        alt={playlist.name} 
                        className="w-full h-full object-cover rounded" 
                      />
                    ) : (
                      <Music className="w-6 h-6 text-neutral-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm truncate ${isDark ? 'text-white' : 'text-black'}`}>{playlist.name}</div>
                    <div className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>Playlist • {playlist.songs.length} songs</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <button 
            onClick={() => {
              LogPrint('Settings button clicked')
              setShowSettings(true)
              // Load cache info when settings is opened
              if (!cacheInfo) {
                loadCacheInfo()
              }
            }}
            className={`mt-auto flex items-center gap-2 transition-colors ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 rounded-lg overflow-hidden flex flex-col ${isDark ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
          {selectedPlaylist ? (
            <>
              {/* Playlist Header with Gradient */}
              <div 
                className="relative p-4 transition-colors duration-1000"
                style={{
                  background: isDark 
                    ? `linear-gradient(to bottom, ${dominantColor}, rgb(23, 23, 23))`
                    : `linear-gradient(to bottom, ${dominantColor}, rgb(245, 245, 245))`
                }}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-24 h-24 rounded shadow-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
                    {selectedPlaylist.coverData ? (
                      <img 
                        src={selectedPlaylist.coverData} 
                        alt={selectedPlaylist.name} 
                        className="w-full h-full object-cover rounded" 
                      />
                    ) : selectedPlaylist.songs[0]?.coverData ? (
                      <img 
                        src={selectedPlaylist.songs[0].coverData} 
                        alt={selectedPlaylist.name} 
                        className="w-full h-full object-cover rounded" 
                      />
                    ) : (
                      <Music className={`w-10 h-10 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold mb-1 ${isDark ? 'text-white' : 'text-black'}`}>PLAYLIST</div>
                    <h1 className={`text-2xl font-black mb-1 truncate ${isDark ? 'text-white' : 'text-black'}`}>{selectedPlaylist.name}</h1>
                    <div className={`text-xs ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                      {selectedPlaylist.songs.length} songs
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className={`px-4 py-3 flex items-center gap-3 ${isDark ? 'bg-gradient-to-b from-neutral-900/95 to-neutral-900' : 'bg-gradient-to-b from-neutral-100/95 to-neutral-100'}`}>
                <button 
                  onClick={() => {
                    if (selectedPlaylist.songs.length > 0) {
                      const startPosition = selectedPlaylist.position || 0
                      const validPosition = startPosition >= 0 && startPosition < selectedPlaylist.songs.length ? startPosition : 0
                      playSong(selectedPlaylist.songs[validPosition], validPosition)
                    }
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg"
                  style={{ backgroundColor: currentTheme.primary }}
                >
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </button>
                <button 
                  onClick={() => togglePlaylistNightcore(selectedPlaylist)}
                  className={`transition-all duration-200 ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}
                  title="Toggle Nightcore Mode for Playlist"
                >
                  {isProcessingNightcore ? (
                    <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                      selectedPlaylist.nightcoreMode 
                        ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg transform scale-110 hover:scale-105' 
                        : 'border-2 border-current hover:bg-current/10 hover:scale-105'
                    }`}>
                      <Cat className="w-5 h-5" />
                    </div>
                  )}
                </button>
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
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className={`grid grid-cols-[16px_4fr_2fr_minmax(120px,1fr)] gap-4 px-4 py-2 text-sm border-b sticky top-0 ${
                  isDark 
                    ? 'text-neutral-400 border-neutral-800 bg-neutral-900' 
                    : 'text-neutral-600 border-neutral-300 bg-neutral-100'
                }`}>
                  <div>#</div>
                  <div>TITLE</div>
                  <div>ALBUM</div>
                  <div className="text-right">⏱</div>
                </div>
                
                {selectedPlaylist.songs.map((song, index) => (
                  <div
                    key={index}
                    onClick={() => playSong(song, index)}
                    className={`grid grid-cols-[16px_4fr_2fr_minmax(120px,1fr)] gap-4 px-4 py-3 rounded-md cursor-pointer group ${
                      currentSong?.title === song.title
                        ? (isDark ? 'bg-neutral-800' : 'bg-neutral-200')
                        : (isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200')
                    }`}
                  >
                    <div className={`flex items-center justify-center ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {currentSong?.title === song.title && isPlaying ? (
                        <span className="text-green-500">♪</span>
                      ) : (
                        <span className="group-hover:hidden">{index + 1}</span>
                      )}
                      <Play className={`w-4 h-4 hidden group-hover:block ${isDark ? 'text-white' : 'text-black'}`} />
                    </div>
                    
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
                        {song.coverData ? (
                          <img src={song.coverData} alt={song.title} className="w-full h-full object-cover rounded" />
                        ) : (
                          <Music className={`w-5 h-5 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium truncate ${currentSong?.title === song.title ? 'text-green-500' : (isDark ? 'text-white' : 'text-black')}`}>
                          {song.title}
                        </div>
                        <div className={`text-sm truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{song.artist}</div>
                      </div>
                    </div>
                    
                    <div className={`flex items-center text-sm truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {selectedPlaylist.name}
                    </div>
                    
                    <div className={`flex items-center justify-end text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {song.duration}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Music className={`w-20 h-20 mx-auto mb-4 ${isDark ? 'text-neutral-700' : 'text-neutral-300'}`} />
                <p className={`text-xl ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>Select a playlist</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Player Bar */}
      {currentSong && (
        <div className={`h-24 border-t px-4 flex items-center gap-4 ${
          isDark 
            ? 'bg-black border-neutral-900' 
            : 'bg-white border-neutral-200'
        }`}>
          {/* Song Info */}
          <div className="w-80 flex items-center gap-3">
            <div className={`w-14 h-14 rounded flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
              {currentSong.coverData ? (
                <img src={currentSong.coverData} alt={currentSong.title} className="w-full h-full object-cover rounded" />
              ) : (
                <Music className={`w-6 h-6 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
              )}
            </div>
            <div className="min-w-0">
              <div className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-black'}`}>{currentSong.title}</div>
              <div className={`text-xs truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{currentSong.artist}</div>
            </div>
            <button className={`ml-2 transition-colors ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}>
              <Heart className="w-5 h-5" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <button onClick={previousSong} className={`transition-colors ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}>
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={togglePlayPause} 
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
              >
                {isPlaying ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
              </button>
              <button onClick={nextSong} className={`transition-colors ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'}`}>
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center gap-2 w-full max-w-2xl">
              <span className={`text-xs w-10 text-right ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{formatTime(currentTime)}</span>
              <div 
                className={`flex-1 h-1 rounded-full cursor-pointer group ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`}
                onClick={seekTo}
              >
                <div 
                  className="h-full bg-white rounded-full relative"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                >
                  <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              </div>
              <span className={`text-xs w-10 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="w-32 flex items-center gap-2">
            <Volume2 className={`w-5 h-5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`} />
            <div className={`flex-1 h-1 rounded-full relative group ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`}>
              <div 
                className="h-full bg-white rounded-full"
                style={{ width: `${volume * 100}%` }}
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
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-2xl p-8 w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl border border-neutral-700">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-3xl font-bold text-white">Settings</h3>
              <button 
                onClick={() => setShowSettings(false)} 
                className="text-neutral-400 hover:text-white transition-colors p-2 hover:bg-neutral-700 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-8">
              {/* Theme */}
              <div>
                <label className="block text-lg font-semibold mb-4 text-white">Appearance</label>
                
                {/* Dark/Light Mode */}
                <div className="mb-6">
                  <div className="text-sm text-neutral-300 mb-3">Theme Mode</div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => saveTheme('dark')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                        isDark 
                          ? 'text-white shadow-lg' 
                          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                      }`}
                      style={isDark ? { backgroundColor: currentTheme.primary } : {}}
                    >
                      <Moon className="w-4 h-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => saveTheme('light')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                        !isDark 
                          ? 'text-white shadow-lg' 
                          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                      }`}
                      style={!isDark ? { backgroundColor: currentTheme.primary } : {}}
                    >
                      <Sun className="w-4 h-4" />
                      Light
                    </button>
                  </div>
                </div>

                {/* Accent Colors */}
                <div>
                  <div className="text-sm text-neutral-300 mb-3">Accent Color</div>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(colorThemes).map(([color, theme]) => (
                      <button
                        key={color}
                        onClick={() => setAccentColor(color)}
                        className={`aspect-square rounded-xl transition-all ${
                          accentColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-800' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: theme.primary }}
                      >
                        <div className="w-full h-full rounded-xl flex items-center justify-center">
                          <div className="w-4 h-4 bg-white/20 rounded-full"></div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio Effects */}
              <div>
                <label className="block text-lg font-semibold mb-4 text-white">Audio Effects</label>
                
                {!ffmpegAvailable && (
                  <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-xl">
                    <div className="text-yellow-300 text-sm font-medium">FFmpeg Required</div>
                    <div className="text-yellow-200/80 text-xs mt-1">
                      Install FFmpeg to enable audio effects. Visit ffmpeg.org for installation instructions.
                    </div>
                  </div>
                )}
                
                {/* Crossfade */}
                <div className="flex items-center justify-between p-4 bg-neutral-800/50 rounded-xl mb-4 border border-neutral-700">
                  <div>
                    <div className="font-medium text-white">Crossfade</div>
                    <div className="text-xs text-neutral-400">Smooth transitions between songs</div>
                  </div>
                  <button
                    onClick={() => setCrossfadeEnabled(!crossfadeEnabled)}
                    className={`w-14 h-7 rounded-full transition-all relative ${
                      crossfadeEnabled ? 'shadow-lg' : 'bg-neutral-600'
                    }`}
                    style={crossfadeEnabled ? { backgroundColor: currentTheme.primary } : {}}
                  >
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                      crossfadeEnabled ? 'translate-x-8' : 'translate-x-1'
                    }`}></div>
                  </button>
                </div>

                {/* Bass Boost */}
                <div className={`flex items-center justify-between p-4 rounded-xl mb-4 border ${
                  ffmpegAvailable ? 'bg-neutral-800/50 border-neutral-700' : 'bg-neutral-800/20 border-neutral-700/50'
                }`}>
                  <div>
                    <div className={`font-medium ${ffmpegAvailable ? 'text-white' : 'text-neutral-500'}`}>Bass Boost</div>
                    <div className="text-xs text-neutral-400">Enhanced low frequencies (+10dB @ 200Hz)</div>
                  </div>
                  <button
                    onClick={() => ffmpegAvailable && setBassBoostEnabled(!bassBoostEnabled)}
                    disabled={!ffmpegAvailable}
                    className={`w-14 h-7 rounded-full transition-all relative ${
                      bassBoostEnabled && ffmpegAvailable ? 'shadow-lg' : 'bg-neutral-600'
                    } ${!ffmpegAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={bassBoostEnabled && ffmpegAvailable ? { backgroundColor: currentTheme.primary } : {}}
                  >
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                      bassBoostEnabled && ffmpegAvailable ? 'translate-x-8' : 'translate-x-1'
                    }`}></div>
                  </button>
                </div>
              </div>

              {/* Cache Management */}
              <div>
                <label className="block text-lg font-semibold mb-4 text-white">Storage</label>
                
                <div className="p-4 bg-neutral-800/50 rounded-xl border border-neutral-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-white">Audio Effects Cache</div>
                    <button
                      onClick={clearCache}
                      disabled={!cacheInfo}
                      className={`px-4 py-2 text-white text-sm rounded-lg transition-all font-medium ${
                        cacheInfo ? 'bg-red-600 hover:bg-red-700 shadow-sm' : 'bg-gray-600 cursor-not-allowed opacity-50'
                      }`}
                    >
                      Clear Cache
                    </button>
                  </div>
                  <div className="text-sm text-neutral-400">
                    {cacheInfo ? (
                      cacheInfo.exists ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span>{cacheInfo.fileCount} files</span>
                            <span>•</span>
                            <span>{cacheInfo.sizeMB.toFixed(2)} MB</span>
                          </div>
                          <div className="text-xs text-neutral-500 font-mono">{cacheInfo.path}</div>
                        </>
                      ) : (
                        'No cache files found'
                      )
                    ) : (
                      'Loading cache info...'
                    )}
                  </div>
                </div>
              </div>

              {/* Debug Section */}
              <div>
                <label className="block text-lg font-semibold mb-4 text-white">Debug</label>
                
                <div className="p-4 bg-neutral-800/50 rounded-xl border border-neutral-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-white">Cover Art Server</div>
                    <button
                      onClick={async () => {
                        try {
                          const { GetCoverServerInfo } = await import('../wailsjs/go/main/App')
                          const info = await GetCoverServerInfo()
                          LogPrint(`Cover Server Info: ${JSON.stringify(info, null, 2)}`)
                          
                          // Test the server
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
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-all font-medium"
                    >
                      Test Server
                    </button>
                  </div>
                  <div className="text-sm text-neutral-400">
                    Test the local cover art server and check Discord RPC status
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