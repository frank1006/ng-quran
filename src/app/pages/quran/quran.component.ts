import { Component } from '@angular/core';
import { SurahListComponent } from './components/surah-list.component';

@Component({
  selector: 'app-quran',
  standalone: true,
  imports: [SurahListComponent],
  template: '<app-surah-list />',
  styleUrl: './quran.component.css'
})
export class QuranComponent {
}

