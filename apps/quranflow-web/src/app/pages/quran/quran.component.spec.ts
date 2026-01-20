import { TestBed } from '@angular/core/testing';
import { QuranComponent } from './quran.component';

describe('QuranComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuranComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(QuranComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render quran title', () => {
    const fixture = TestBed.createComponent(QuranComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Quran');
  });
});

