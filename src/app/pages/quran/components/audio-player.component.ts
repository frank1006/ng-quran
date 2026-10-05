import { Component, computed, inject, input } from '@angular/core';
import { QuranAudioService } from '../../../services/quran-audio.service';
import { formatPlaybackTime } from '../../../shared/components/mini-player/mini-player.component';

/** Player controls on a surah page; the audio itself lives in QuranAudioService */
@Component({
  selector: 'app-audio-player',
  standalone: true,
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.css'
})
export class AudioPlayerComponent {
  /** The surah this page shows: the controls appear only while it is the one reciting */
  readonly chapterId = input<number | null>(null);

  protected readonly audio = inject(QuranAudioService);
  protected readonly visible = computed(() => {
    const track = this.audio.track();
    return !!track && track.chapterId === this.chapterId();
  });
  protected readonly formatTime = formatPlaybackTime;

  protected onSeek(event: Event): void {
    this.audio.seek(parseFloat((event.target as HTMLInputElement).value));
  }
}
