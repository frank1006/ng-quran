import { TestBed } from '@angular/core/testing';
import { QiblaComponent } from './qibla.component';

describe('QiblaComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QiblaComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(QiblaComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render qibla title', () => {
    const fixture = TestBed.createComponent(QiblaComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Qibla');
  });
});

