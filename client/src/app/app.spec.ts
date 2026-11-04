import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ThemeService } from './core/ui/theme.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('crea lo shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('mostra il marchio del tavolo', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('D&D VTT');
  });

  it("mostra l'icona del tema attivo", async () => {
    const theme = TestBed.inject(ThemeService);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector('.theme-toggle');

    theme.set('dark');
    fixture.detectChanges();
    expect(toggle?.textContent).toContain('dark_mode');
    expect(toggle?.getAttribute('aria-label')).toBe('Tema: dark. Cambia tema');

    theme.set('light');
    fixture.detectChanges();
    expect(toggle?.textContent).toContain('light_mode');
    expect(toggle?.getAttribute('aria-label')).toBe('Tema: light. Cambia tema');
  });
});
