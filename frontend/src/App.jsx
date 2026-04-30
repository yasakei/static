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

  // ─── M3 Expressive helpers ───────────────────────────────────────────────
  const p = currentTheme.primary          // accent shorthand
  const pAlpha = (a) => `${p}${Math.round(a*255).toString(16).padStart(2,'0')}`

  // M3 Expressive surface tokens
  const surf   = isDark ? '#1a1c1e' : '#f6f4ff'   // base surface
  const surf1  = isDark ? '#1f2123' : '#edeaff'   // surface container low
  const surf2  = isDark ? '#2a2d30' : '#e4e0f8'   // surface container
  const surf3  = isDark ? '#35383b' : '#d9d5f2'   // surface container high
  const onSurf = isDark ? '#e3e2e6' : '#1c1a2e'   // on-surface
  const onSurfVar = isDark ? '#c7c6ca' : '#48455e' // on-surface variant
  const outline   = isDark ? '#3a3d40' : '#c4c0db' // outline

  if (loading) {
    LogPrint('Rendering loading screen')
    return (
      <div className="h-screen flex flex-col" style={{ background: surf }}>
        {/* top bar — app name flush left, very M3 */}
        <div className="px-10 pt-10">
          <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: p }}>Static</span>
        </div>

        {/* center — big display wordmark + icon pill */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {/* icon pill — tonal container, no glow */}
          <div
            className="w-20 h-20 rounded-[2rem] flex items-center justify-center"
            style={{ background: `${p}22` }}
          >
            <Disc3 className="w-9 h-9" style={{ color: p }} />
          </div>

          {/* display text — the M3 Expressive signature */}
          <div className="text-center">
            <h1
              className="font-black leading-none tracking-tight"
              style={{ fontSize: '5rem', color: onSurf }}
            >
              static
            </h1>
            <p className="mt-3 text-base font-medium" style={{ color: onSurfVar }}>
              Music Player
            </p>
          </div>

          {/* M3 linear progress — thin, full-width-ish, no rounded caps on track */}
          <div className="w-56 overflow-hidden" style={{ height: '3px', background: surf2, borderRadius: '99px' }}>
            <div
              className="h-full"
              style={{
                background: p,
                borderRadius: '99px',
                width: '40%',
                animation: 'loading-slide 1.4s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* bottom label */}
        <div className="px-10 pb-10 text-right">
          <span className="text-xs font-medium" style={{ color: onSurfVar }}>Loading your library</span>
        </div>

        <style>{`
          @keyframes loading-slide {
            0%   { transform: translateX(-100%); width: 40%; }
            50%  { width: 60%; }
            100% { transform: translateX(350%); width: 40%; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: surf, color: onSurf }}>
      <audio ref={audioRef} />

      {/* ── Layout ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Navigation Rail ─────────────────────────────────────────── */}
        <div className="w-60 flex flex-col py-6 px-4 flex-shrink-0" style={{ background: surf }}>

          {/* Wordmark */}
          <div className="px-2 mb-8">
            <h1 className="text-xl font-black tracking-tight" style={{ color: onSurf }}>
              static<span style={{ color: p }}>.</span>
            </h1>
            <p className="text-[10px] font-medium mt-0.5 uppercase tracking-wider" style={{ color: onSurfVar }}>Music Player</p>
          </div>

          {/* Library label */}
          <div className="px-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: onSurfVar }}>Library</span>
          </div>

          {/* Playlist list */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {playlists.map((playlist, index) => {
              const active = selectedPlaylist?.name === playlist.name
              return (
                <div
                  key={index}
                  onClick={() => {
                    setSelectedPlaylist(playlist)
                    if (playlist.songs?.length > 0) {
                      const pos = playlist.position || 0
                      setCurrentSongIndex(pos >= 0 && pos < playlist.songs.length ? pos : 0)
                    }
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: active ? surf2 : 'transparent',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = surf1 }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: surf2 }}>
                    {playlist.coverData ? (
                      <img src={playlist.coverData} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : playlist.songs[0]?.coverData ? (
                      <img src={playlist.songs[0].coverData} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : (
                      <ListMusic className="w-4 h-4" style={{ color: onSurfVar }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate" style={{ color: active ? p : onSurf }}>{playlist.name}</div>
                    <div className="text-xs truncate" style={{ color: onSurfVar }}>{playlist.songs.length} songs</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Settings button */}
          <button
            onClick={() => { setShowSettings(true); if (!cacheInfo) loadCacheInfo() }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl mt-4 transition-all"
            style={{ color: onSurfVar }}
            onMouseEnter={e => e.currentTarget.style.background = surf1}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ background: surf1 }}>
          {selectedPlaylist ? (
            <>
              {/* Playlist Header — M3 Expressive: big display type, compact squircle cover */}
              <div className="p-8 pb-6">
                <div className="flex items-end gap-6">
                  {/* Squircle cover art */}
                  <div className="w-32 h-32 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: surf2 }}>
                    {selectedPlaylist.coverData ? (
                      <img src={selectedPlaylist.coverData} alt={selectedPlaylist.name} className="w-full h-full object-cover" />
                    ) : selectedPlaylist.songs[0]?.coverData ? (
                      <img src={selectedPlaylist.songs[0].coverData} alt={selectedPlaylist.name} className="w-full h-full object-cover" />
                    ) : (
                      <Album className="w-14 h-14" style={{ color: onSurfVar }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: onSurfVar }}>Playlist</div>
                    <h1 className="text-6xl font-black leading-none tracking-tight truncate mb-3" style={{ color: onSurf }}>
                      {selectedPlaylist.name}
                    </h1>
                    <div className="flex items-center gap-2 text-sm" style={{ color: onSurfVar }}>
                      <ListMusic className="w-4 h-4" />
                      <span className="font-medium">{selectedPlaylist.songs.length} songs</span>
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

              {/* Controls — M3 FAB-style play button + tonal nightcore toggle */}
              <div className="px-8 pb-6 flex items-center gap-4">
                <button
                  onClick={() => {
                    if (selectedPlaylist.songs.length > 0) {
                      const startPosition = selectedPlaylist.position || 0
                      const validPosition = startPosition >= 0 && startPosition < selectedPlaylist.songs.length ? startPosition : 0
                      playSong(selectedPlaylist.songs[validPosition], validPosition)
                    }
                  }}
                  className="w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 transition-all"
                  style={{ 
                    background: p,
                    boxShadow: `0 2px 8px ${p}40`
                  }}
                >
                  {isPlaying && currentSong ? (
                    <Pause className="w-7 h-7 text-white" />
                  ) : (
                    <Play className="w-7 h-7 text-white ml-0.5" />
                  )}
                </button>
                
                <button
                  onClick={() => togglePlaylistNightcore(selectedPlaylist)}
                  className="transition-all duration-200"
                  title="Toggle Nightcore Mode for Playlist"
                >
                  {isProcessingNightcore ? (
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: p }}></div>
                  ) : (
                    <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        background: selectedPlaylist.nightcoreMode ? surf2 : 'transparent',
                        color: selectedPlaylist.nightcoreMode ? p : onSurfVar
                      }}
                      onMouseEnter={e => { if (!selectedPlaylist.nightcoreMode) e.currentTarget.style.background = surf2 }}
                      onMouseLeave={e => { if (!selectedPlaylist.nightcoreMode) e.currentTarget.style.background = 'transparent' }}
                    >
                      <Cat className="w-5 h-5" />
                    </div>
                  )}
                </button>

                <div className="flex-1 flex items-center gap-3 px-5 py-3 rounded-full" style={{ background: surf2 }}>
                  <Zap className="w-4 h-4" style={{ color: selectedPlaylist.nightcoreMode ? p : onSurfVar }} />
                  <span className="text-sm font-medium" style={{ color: selectedPlaylist.nightcoreMode ? p : onSurfVar }}>
                    {selectedPlaylist.nightcoreMode ? 'Nightcore Mode Active' : 'Nightcore Mode Off'}
                  </span>
                </div>
              </div>

              {/* Nightcore Progress Bar — M3 tonal container */}
              {nightcoreProgress[selectedPlaylist?.name] && (
                <div className="mx-6 mb-4 px-4 py-3 rounded-2xl" style={{ background: `${p}15` }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: p }}></div>
                    <div className="text-sm font-semibold" style={{ color: p }}>
                      Processing Nightcore Mode...
                    </div>
                  </div>
                  <div className="text-xs mb-2" style={{ color: pAlpha(0.7) }}>
                    {nightcoreProgress[selectedPlaylist.name].current}/{nightcoreProgress[selectedPlaylist.name].total} - {nightcoreProgress[selectedPlaylist.name].songTitle}
                  </div>
                  <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: `${p}22` }}>
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        background: p,
                        width: `${(nightcoreProgress[selectedPlaylist.name].current / nightcoreProgress[selectedPlaylist.name].total) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Song List — M3 tonal container rows */}
              <div className="flex-1 overflow-y-auto px-8">
                <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-3 py-3 text-[10px] font-bold uppercase tracking-widest sticky top-0 z-10"
                  style={{ color: onSurfVar, background: surf1 }}>
                  <div className="w-8 text-center">#</div>
                  <div>Title</div>
                  <div>Album</div>
                  <div className="pr-8"><Clock className="w-3.5 h-3.5 ml-auto" /></div>
                </div>

                {selectedPlaylist.songs.map((song, index) => {
                  const active = currentSong?.title === song.title
                  return (
                    <div
                      key={index}
                      onClick={() => playSong(song, index)}
                      className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-3 py-2.5 rounded-xl cursor-pointer group transition-all mb-0.5"
                      style={{
                        background: active ? surf2 : 'transparent'
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = surf2 }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div className="flex items-center justify-center w-8" style={{ color: onSurfVar }}>
                        {active && isPlaying ? (
                          <div className="flex items-center gap-0.5">
                            <span className="w-0.5 h-3 rounded-full animate-pulse" style={{ background: p }}></span>
                            <span className="w-0.5 h-4 rounded-full animate-pulse" style={{ background: p, animationDelay: '0.1s' }}></span>
                            <span className="w-0.5 h-2 rounded-full animate-pulse" style={{ background: p, animationDelay: '0.2s' }}></span>
                          </div>
                        ) : (
                          <>
                            <span className="group-hover:hidden text-sm font-medium">{index + 1}</span>
                            <Play className="w-4 h-4 hidden group-hover:block" style={{ color: onSurf }} />
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                          style={{ background: surf }}>
                          {song.coverData ? (
                            <img src={song.coverData} alt={song.title} className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-4 h-4" style={{ color: onSurfVar }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: active ? p : onSurf }}>
                            {song.title}
                          </div>
                          <div className="text-xs truncate" style={{ color: onSurfVar }}>{song.artist}</div>
                        </div>
                      </div>

                      <div className="flex items-center text-sm truncate" style={{ color: onSurfVar }}>
                        {selectedPlaylist.name}
                      </div>

                      <div className="flex items-center justify-end text-sm font-mono tabular-nums" style={{ color: onSurfVar }}>
                        {song.duration}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background: surf2 }}>
                  <Radio className="w-12 h-12" style={{ color: onSurfVar }} />
                </div>
                <p className="text-lg font-semibold mb-1" style={{ color: onSurf }}>Select a playlist</p>
                <p className="text-sm" style={{ color: onSurfVar }}>Choose from your library to start playing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Player Bar — M3 Expressive */}
      {currentSong && (
        <div className="h-20 px-6 flex items-center gap-6" style={{ background: surf1, borderTop: `1px solid ${outline}` }}>
          {/* Song Info */}
          <div className="w-72 flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: surf2 }}>
              {currentSong.coverData ? (
                <img src={currentSong.coverData} alt={currentSong.title} className="w-full h-full object-cover" />
              ) : (
                <Music className="w-6 h-6" style={{ color: onSurfVar }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate" style={{ color: onSurf }}>{currentSong.title}</div>
              <div className="text-xs truncate" style={{ color: onSurfVar }}>{currentSong.artist}</div>
            </div>
            <button className="transition-colors" style={{ color: onSurfVar }}
              onMouseEnter={e => e.currentTarget.style.color = p}
              onMouseLeave={e => e.currentTarget.style.color = onSurfVar}>
              <Heart className="w-5 h-5" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <button onClick={previousSong} className="transition-all" style={{ color: onSurfVar }}
                onMouseEnter={e => { e.currentTarget.style.color = onSurf; e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.color = onSurfVar; e.currentTarget.style.transform = 'scale(1)' }}>
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlayPause}
                className="w-11 h-11 rounded-2xl flex items-center justify-center hover:scale-105 transition-transform"
                style={{ background: p }}
              >
                {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
              </button>
              <button onClick={nextSong} className="transition-all" style={{ color: onSurfVar }}
                onMouseEnter={e => { e.currentTarget.style.color = onSurf; e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.color = onSurfVar; e.currentTarget.style.transform = 'scale(1)' }}>
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 w-full max-w-2xl">
              <span className="text-xs w-10 text-right font-mono" style={{ color: onSurfVar }}>{formatTime(currentTime)}</span>
              <div
                className="flex-1 h-1.5 rounded-full cursor-pointer group overflow-hidden"
                style={{ background: surf2 }}
                onClick={seekTo}
              >
                <div
                  className="h-full rounded-full relative transition-all"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%`, background: p }}
                >
                  <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"></div>
                </div>
              </div>
              <span className="text-xs w-10 font-mono" style={{ color: onSurfVar }}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="w-32 flex items-center gap-3">
            <button onClick={() => setVolume(volume === 0 ? 0.7 : 0)} className="transition-colors" style={{ color: onSurfVar }}
              onMouseEnter={e => e.currentTarget.style.color = onSurf}
              onMouseLeave={e => e.currentTarget.style.color = onSurfVar}>
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="flex-1 h-1.5 rounded-full relative group overflow-hidden" style={{ background: surf2 }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${volume * 100}%`, background: p }}
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

      {/* Settings Modal — M3 Expressive */}
      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-3xl p-8 w-[540px] max-h-[85vh] overflow-y-auto" style={{ background: surf1 }}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: surf2 }}>
                  <Settings className="w-6 h-6" style={{ color: p }} />
                </div>
                <h3 className="text-3xl font-black tracking-tight" style={{ color: onSurf }}>Settings</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="transition-all p-2 rounded-2xl"
                style={{ color: onSurfVar }}
                onMouseEnter={e => e.currentTarget.style.background = surf2}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-8">
              {/* Theme */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4" style={{ color: onSurfVar }} />
                  <label className="text-xs font-bold uppercase tracking-widest" style={{ color: onSurfVar }}>Appearance</label>
                </div>

                {/* Dark/Light Mode */}
                <div className="mb-5">
                  <div className="text-sm mb-3 font-medium" style={{ color: onSurf }}>Theme Mode</div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => saveTheme('dark')}
                      className="flex-1 px-4 py-3.5 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
                      style={{
                        background: isDark ? p : surf2,
                        color: isDark ? '#fff' : onSurfVar
                      }}
                    >
                      <Moon className="w-4 h-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => saveTheme('light')}
                      className="flex-1 px-4 py-3.5 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
                      style={{
                        background: !isDark ? p : surf2,
                        color: !isDark ? '#fff' : onSurfVar
                      }}
                    >
                      <Sun className="w-4 h-4" />
                      Light
                    </button>
                  </div>
                </div>

                {/* Accent Colors */}
                <div>
                  <div className="text-sm mb-3 font-medium" style={{ color: onSurf }}>Accent Color</div>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(colorThemes).map(([color, theme]) => (
                      <button
                        key={color}
                        onClick={() => setAccentColor(color)}
                        className="aspect-square rounded-2xl transition-all border-4 hover:scale-105"
                        style={{
                          backgroundColor: theme.primary,
                          borderColor: accentColor === color ? surf : 'transparent'
                        }}
                      >
                        <div className="w-full h-full rounded-xl flex items-center justify-center">
                          {accentColor === color && <Check className="w-6 h-6 text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio Effects */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Headphones className="w-4 h-4" style={{ color: onSurfVar }} />
                  <label className="text-xs font-bold uppercase tracking-widest" style={{ color: onSurfVar }}>Audio Effects</label>
                </div>

                {!ffmpegAvailable && (
                  <div className="mb-4 p-4 rounded-2xl" style={{ background: `${colorThemes.pink.primary}15` }}>
                    <div className="font-semibold text-sm flex items-center gap-2 mb-1" style={{ color: colorThemes.pink.primary }}>
                      <Zap className="w-4 h-4" />
                      FFmpeg Required
                    </div>
                    <div className="text-xs" style={{ color: `${colorThemes.pink.primary}cc` }}>
                      Install FFmpeg to enable audio effects. Visit ffmpeg.org for installation instructions.
                    </div>
                  </div>
                )}

                {/* Crossfade */}
                <div className="flex items-center justify-between p-4 rounded-2xl mb-3" style={{ background: surf2 }}>
                  <div>
                    <div className="font-semibold" style={{ color: onSurf }}>Crossfade</div>
                    <div className="text-xs mt-0.5" style={{ color: onSurfVar }}>Smooth transitions between songs</div>
                  </div>
                  <button
                    onClick={() => setCrossfadeEnabled(!crossfadeEnabled)}
                    className="w-12 h-6 rounded-full transition-all relative"
                    style={{ background: crossfadeEnabled ? p : surf3 }}
                  >
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm"
                      style={{ transform: crossfadeEnabled ? 'translateX(24px)' : 'translateX(2px)' }}></div>
                  </button>
                </div>

                {/* Bass Boost */}
                <div className="flex items-center justify-between p-4 rounded-2xl" style={{
                  background: surf2,
                  opacity: ffmpegAvailable ? 1 : 0.5
                }}>
                  <div>
                    <div className="font-semibold" style={{ color: onSurf }}>Bass Boost</div>
                    <div className="text-xs mt-0.5" style={{ color: onSurfVar }}>Enhanced low frequencies (+10dB @ 200Hz)</div>
                  </div>
                  <button
                    onClick={() => ffmpegAvailable && setBassBoostEnabled(!bassBoostEnabled)}
                    disabled={!ffmpegAvailable}
                    className="w-12 h-6 rounded-full transition-all relative"
                    style={{ background: bassBoostEnabled && ffmpegAvailable ? p : surf3 }}
                  >
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm"
                      style={{ transform: bassBoostEnabled && ffmpegAvailable ? 'translateX(24px)' : 'translateX(2px)' }}></div>
                  </button>
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Disc3 className="w-4 h-4" style={{ color: onSurfVar }} />
                  <label className="text-xs font-bold uppercase tracking-widest" style={{ color: onSurfVar }}>Storage</label>
                </div>

                <div className="p-4 rounded-2xl" style={{ background: surf2 }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold" style={{ color: onSurf }}>Audio Effects Cache</div>
                    <button
                      onClick={clearCache}
                      disabled={!cacheInfo}
                      className="px-4 py-2 text-xs font-bold rounded-2xl transition-all"
                      style={{
                        background: cacheInfo ? colorThemes.pink.primary : surf3,
                        color: cacheInfo ? '#fff' : onSurfVar,
                        opacity: cacheInfo ? 1 : 0.5
                      }}
                    >
                      Clear Cache
                    </button>
                  </div>
                  <div className="text-sm" style={{ color: onSurfVar }}>
                    {cacheInfo ? (
                      cacheInfo.exists ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs px-2 py-1 rounded-lg" style={{ background: surf3 }}>{cacheInfo.path}</span>
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
                  <MoreHorizontal className="w-4 h-4" style={{ color: onSurfVar }} />
                  <label className="text-xs font-bold uppercase tracking-widest" style={{ color: onSurfVar }}>Debug</label>
                </div>

                <div className="p-4 rounded-2xl" style={{ background: surf2 }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold" style={{ color: onSurf }}>Cover Art Server</div>
                      <div className="text-xs mt-0.5" style={{ color: onSurfVar }}>Test the local cover art server</div>
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
                      className="px-4 py-2 text-xs font-bold rounded-2xl transition-all"
                      style={{ background: colorThemes.blue.primary, color: '#fff' }}
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