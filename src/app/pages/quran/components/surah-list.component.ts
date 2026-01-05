import { Component, OnInit, signal, computed, effect, DestroyRef, inject, ChangeDetectionStrategy, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { QuranApiService } from '../../../services/quran-api.service';
import { UserStoreService } from '../../../services/user-store.service';
import { Chapter, Reciter } from '../../../services/quran-api.types';
import { ConnectionErrorComponent } from '../../../shared/components/connection-error/connection-error.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-surah-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent, LoadingSpinnerComponent],
  templateUrl: './surah-list.component.html',
  styleUrl: './surah-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SurahListComponent implements OnInit {
  protected readonly chapters = signal<Chapter[]>([]);
  protected readonly reciters = signal<Reciter[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly searchQuery = signal<string>('');

  protected readonly selectedReciterId = computed(() => this.userStore.selectedReciterId());

  protected readonly filteredChapters = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allChapters = this.chapters();

    if (!query) {
      return allChapters;
    }

    return allChapters.filter(chapter => {
      const nameMatch = chapter.name.toLowerCase().includes(query);
      const transliterationMatch = chapter.transliteration.toLowerCase().includes(query);
      const translationMatch = chapter.translation.toLowerCase().includes(query);
      const idMatch = chapter.id.toString().includes(query);
      
      return nameMatch || transliterationMatch || translationMatch || idMatch;
    });
  });

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private quranApi: QuranApiService,
    private userStore: UserStoreService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadChapters();
    this.loadReciters();
  }

  private loadChapters(): void {
    this.loading.set(true);
    this.error.set(null);

    this.quranApi.getChapters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chapters) => {
          this.chapters.set(chapters);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load chapters');
          this.loading.set(false);
          if (isDevMode()) {
            console.error('Error loading chapters:', err);
          }
        }
      });
  }

  private loadReciters(): void {
    this.quranApi.getReciters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reciters) => {
          this.reciters.set(reciters);
          
          // Set default reciter only if no reciter is currently selected
          // This must happen AFTER reciters are loaded to avoid race conditions
          const currentReciterId = this.selectedReciterId();
          if (reciters.length > 0 && currentReciterId === null) {
            this.userStore.setSelectedReciter(reciters[0].id);
          }
        },
        error: (err) => {
          if (isDevMode()) {
            console.error('Error loading reciters:', err);
          }
        }
      });
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  onReciterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const reciterId = select.value ? parseInt(select.value, 10) : null;
    this.userStore.setSelectedReciter(reciterId);
  }

  navigateToSurah(chapterId: number): void {
    this.router.navigate(['/quran', chapterId]);
  }

  protected retry(): void {
    this.loadChapters();
  }
}

