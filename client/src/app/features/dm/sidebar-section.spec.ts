import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SidebarSection } from './sidebar-section';

@Component({
  selector: 'app-sidebar-section-host',
  imports: [SidebarSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-section
      id="scenes"
      label="Scene"
      [open]="open()"
      [count]="count()"
      [hasActions]="hasActions()"
      (toggled)="toggle()"
    >
      <button actions type="button" class="section-action">Crea scena</button>
      <p class="section-body">Contenuto</p>
    </app-sidebar-section>
  `,
})
class HostComponent {
  public readonly open = signal(true);
  public readonly count = signal<number | null>(3);
  public readonly hasActions = signal(true);
  public readonly toggles = signal(0);

  public toggle(): void {
    this.toggles.update((value) => value + 1);
  }
}

describe('SidebarSection', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  const create = (): { root: HTMLElement; host: HostComponent; fixture: ComponentFixture<HostComponent> } => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      root: fixture.nativeElement as HTMLElement,
      host: fixture.componentInstance,
      fixture,
    };
  };

  it('mostra trigger, contatore, chevron e corpo quando è aperta', () => {
    const { root } = create();
    const section = root.querySelector('section.accordion') as HTMLElement;
    const trigger = root.querySelector('.accordion__trigger') as HTMLButtonElement;
    const body = root.querySelector('.accordion__body') as HTMLElement;

    expect(section).not.toBeNull();
    expect(trigger.textContent).toContain('Scene');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('sidebar-scenes');
    expect(root.querySelector('.accordion__chevron')?.textContent).toBe('▾');
    expect(root.querySelector('.accordion__count')?.textContent).toBe('3');
    expect(body.id).toBe('sidebar-scenes');
    expect(body.textContent).toContain('Contenuto');
  });

  it('nasconde il corpo e aggiorna aria e chevron quando è chiusa', () => {
    const { root, host, fixture } = create();

    host.open.set(false);
    fixture.detectChanges();

    const trigger = root.querySelector('.accordion__trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.accordion__body')).toBeNull();
    expect(root.querySelector('.section-body')).toBeNull();
    expect(root.querySelector('.accordion__chevron')?.textContent).toBe('▸');
  });

  it('non mostra il contatore quando count è null', () => {
    const { root, host, fixture } = create();

    host.count.set(null);
    fixture.detectChanges();

    expect(root.querySelector('.accordion__count')).toBeNull();
  });

  it('proietta le azioni solo quando hasActions è attivo', () => {
    const { root, host, fixture } = create();

    expect(root.querySelector('.accordion__actions .section-action')?.textContent).toBe('Crea scena');

    host.hasActions.set(false);
    fixture.detectChanges();

    expect(root.querySelector('.accordion__actions')).toBeNull();
    expect(root.querySelector('.section-action')).toBeNull();
  });

  it('emette toggled al click sul trigger', () => {
    const { root, host, fixture } = create();
    const trigger = root.querySelector('.accordion__trigger') as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();

    expect(host.toggles()).toBe(1);
  });
});
