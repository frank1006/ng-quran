import { Component, OnInit, OnDestroy, input, output, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkStatusService } from '../../../services/network-status.service';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentVerse: number | null;
}

@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.css'
})
export class AudioPlayerComponent implements OnInit, OnDestroy {
  readonly audioUrl = input<string | null>(null);
  readonly currentVerse = input<number | null>(null);
  readonly totalVerses = input<number>(0);
  readonly autoPlay = input<boolean>(false);
  readonly forcePause = input<boolean>(false);

  readonly playNext = output<void>();
  readonly playPrevious = output<void>();
  readonly verseChange = output<number>();
  readonly playingStateChange = output<boolean>();

  protected readonly state = signal<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentVerse: null
  });

  private audio: HTMLAudioElement | null = null;
  private progressInterval: number | null = null;
  private previousUrl: string | null = null;
  private shouldAutoPlay = false;
  private eventHandlers: { [key: string]: (e: Event) => void } = {};
  private readonly networkStatus = inject(NetworkStatusService);

  constructor() {
    // Handle audio URL changes - auto-play when URL changes (user clicked play)
    effect(() => {
      const url = this.audioUrl();
      if (url && url !== this.previousUrl) {
        this.previousUrl = url;
        this.loadAudio(url);
        // Auto-play when URL changes (user initiated play) unless forcePause is true
        if (!this.forcePause()) {
          this.shouldAutoPlay = true;
        }
      } else if (!url && this.previousUrl) {
        // Clear previous URL when audio URL is cleared
        this.previousUrl = null;
        this.pause();
      }
    });

    // Handle force pause (pause without clearing URL)
    effect(() => {
      if (this.forcePause() && this.audio && !this.audio.paused) {
        this.pause();
      } else if (!this.forcePause() && this.audio && this.audio.paused && this.audioUrl() && this.previousUrl) {
        // Resume if not force paused and audio is paused
        this.play().catch(() => {
          // Play failed - user interaction might be required
        });
      }
    });
  }

  ngOnInit(): void {
    this.initializeAudio();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private initializeAudio(): void {
    if (typeof Audio !== 'undefined') {
      this.audio = new Audio();
      this.setupAudioListeners();
    }
  }

  private setupAudioListeners(): void {
    if (!this.audio) return;

    // Event handlers (defined once to prevent duplicate listeners)
    this.eventHandlers['loadedmetadata'] = () => {
      if (this.audio) {
        this.state.update(s => ({ ...s, duration: this.audio!.duration }));
        // Auto-play when metadata is loaded if we should auto-play
        if (this.shouldAutoPlay) {
          this.shouldAutoPlay = false;
          this.play().catch(() => {
            // Auto-play was prevented, user needs to interact
            this.shouldAutoPlay = false;
          });
        }
      }
    };

    this.eventHandlers['canplay'] = () => {
      // Auto-play when audio can play if we should auto-play
      if (this.shouldAutoPlay && this.audio && this.audio.readyState >= 2) {
        this.shouldAutoPlay = false;
        this.play().catch(() => {
          // Auto-play was prevented (user interaction required)
          this.shouldAutoPlay = false;
        });
      }
    };

    this.eventHandlers['timeupdate'] = () => {
      if (this.audio) {
        this.state.update(s => ({ ...s, currentTime: this.audio!.currentTime }));
      }
    };

    this.eventHandlers['pause'] = () => {
      // Sync state when audio is paused (either by user or programmatically)
      if (this.audio) {
        this.state.update(s => ({ ...s, isPlaying: false }));
        this.stopProgressTracking();
        this.playingStateChange.emit(false);
      }
    };

    this.eventHandlers['play'] = () => {
      // Sync state when audio starts playing
      if (this.audio) {
        this.state.update(s => ({ ...s, isPlaying: true }));
        this.startProgressTracking();
        this.playingStateChange.emit(true);
      }
    };

    this.eventHandlers['ended'] = () => {
      this.state.update(s => ({ ...s, isPlaying: false, currentTime: 0 }));
      this.stopProgressTracking();
      this.playingStateChange.emit(false);
      this.playNext.emit();
    };

    this.eventHandlers['error'] = (e: Event) => {
      if (this.audio) {
        this.state.update(s => ({ ...s, isPlaying: false }));
        this.stopProgressTracking();
        this.shouldAutoPlay = false;
        
        // Check if it's a network error
        const audioError = this.audio.error;
        if (audioError) {
          // MediaError codes: MEDIA_ERR_NETWORK = 2, MEDIA_ERR_SRC_NOT_SUPPORTED = 4
          // Network errors typically result in MEDIA_ERR_NETWORK (2) or MEDIA_ERR_SRC_NOT_SUPPORTED (4) when offline
          const isNetworkError = audioError.code === 2 || // MEDIA_ERR_NETWORK
                                 audioError.code === 4 || // MEDIA_ERR_SRC_NOT_SUPPORTED (when network fails)
                                 !navigator.onLine;
          
          if (isNetworkError) {
            // Show offline banner when audio fails to load due to network issues
            this.networkStatus.showOfflineBanner();
          }
        } else if (!navigator.onLine) {
          // Also check navigator.onLine as fallback
          this.networkStatus.showOfflineBanner();
        }
      }
    };

    // Add event listeners
    Object.entries(this.eventHandlers).forEach(([event, handler]) => {
      this.audio!.addEventListener(event, handler);
    });
  }

  private loadAudio(url: string): void {
    if (!this.audio) {
      this.initializeAudio();
    }

    if (this.audio) {
      try {
        // Pause current audio if playing
        if (!this.audio.paused) {
          this.audio.pause();
        }
        
        // Stop progress tracking
        this.stopProgressTracking();
        
        // Reset state
        this.state.update(s => ({ ...s, currentTime: 0, duration: 0, isPlaying: false }));
        
        // Load new audio
        this.audio.src = url;
        this.audio.load();
      } catch (error) {
        // Silently handle errors during audio loading (might be due to navigation)
        this.state.update(s => ({ ...s, isPlaying: false }));
        this.stopProgressTracking();
      }
    }
  }

  protected togglePlayPause(): void {
    if (!this.audio) return;

    if (this.state().isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  protected play(): Promise<void> {
    if (!this.audio || !this.audioUrl()) {
      return Promise.reject(new Error('Audio not available'));
    }

    return this.audio.play().then(() => {
      if (this.audio) { // Check if audio still exists (component might be destroyed)
        this.state.update(s => ({ ...s, isPlaying: true }));
        this.startProgressTracking();
        this.playingStateChange.emit(true);
      }
    }).catch((error) => {
      // Handle play errors
      if (this.audio) {
        this.state.update(s => ({ ...s, isPlaying: false }));
        this.playingStateChange.emit(false);
        
        // Check if it's a network error
        const audioError = this.audio.error;
        if (audioError) {
          // MediaError codes: MEDIA_ERR_NETWORK = 2, MEDIA_ERR_SRC_NOT_SUPPORTED = 4
          const isNetworkError = audioError.code === 2 || // MEDIA_ERR_NETWORK
                                 audioError.code === 4 || // MEDIA_ERR_SRC_NOT_SUPPORTED (when network fails)
                                 !navigator.onLine;
          
          if (isNetworkError) {
            // Show offline banner when play fails due to network issues
            this.networkStatus.showOfflineBanner();
          }
        } else if (!navigator.onLine) {
          // Also check navigator.onLine as fallback
          this.networkStatus.showOfflineBanner();
        }
      }
      // Don't throw error to prevent unhandled promise rejection
    });
  }

  protected pause(): void {
    if (!this.audio) return;

    this.audio.pause();
    this.state.update(s => ({ ...s, isPlaying: false }));
    this.stopProgressTracking();
    this.playingStateChange.emit(false);
  }

  protected skipNext(): void {
    this.playNext.emit();
  }

  protected skipPrevious(): void {
    this.playPrevious.emit();
  }

  protected onSeek(event: Event): void {
    const input = event.target as HTMLInputElement;
    const time = parseFloat(input.value);
    
    if (this.audio) {
      this.audio.currentTime = time;
      this.state.update(s => ({ ...s, currentTime: time }));
    }
  }

  protected formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = window.setInterval(() => {
      if (this.audio) {
        this.state.update(s => ({ ...s, currentTime: this.audio!.currentTime }));
      }
    }, 100);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private cleanup(): void {
    this.stopProgressTracking();
    this.shouldAutoPlay = false;
    
    if (this.audio) {
      try {
        // Remove all event listeners
        Object.entries(this.eventHandlers).forEach(([event, handler]) => {
          this.audio!.removeEventListener(event, handler);
        });
        this.eventHandlers = {};
        
        // Pause audio if playing
        if (!this.audio.paused) {
          this.audio.pause();
        }
        // Clear the audio source
        this.audio.src = '';
        // Remove the audio element reference
        this.audio = null;
      } catch (error) {
        // Ignore any errors during cleanup (audio element might already be invalid)
        this.audio = null;
      }
    }
    
    this.previousUrl = null;
  }
}

