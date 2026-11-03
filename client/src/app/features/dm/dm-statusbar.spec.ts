import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DmStatusbar, type DmStatusbarToken } from './dm-statusbar';

@Component({
  selector: 'app-dm-statusbar-host',
  imports: [DmStatusbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dm-statusbar
      [message]="message()"
      [syncStatus]="syncStatus()"
      [syncLabel]="syncLabel()"
      [version]="version()"
      [tokenCount]="tokenCount()"
      [zoomLabel]="zoomLabel()"
      [measureLabel]="measureLabel()"
      [selectedToken]="selectedToken()"
      [sessionLabel]="sessionLabel()"
      (sync)="synced = synced + 1"
    />
  `,
})
class HostComponent {
  public readonly message = signal('Console pronta.');
  public readonly syncStatus = signal('synced');
  public readonly syncLabel = signal('synced');
  public readonly version = signal(42);
  public readonly tokenCount = signal(3);
  public readonly zoomLabel = signal('125%');
  public readonly measureLabel = signal('3 m');
  public readonly selectedToken = signal<DmStatusbarToken | null>(null);
  public readonly sessionLabel = signal('00:12:34');
  public synced = 0;
}

describe('DmStatusbar', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  const create = (): {
    root: HTMLElement;
    host: HostComponent;
    fixture: ComponentFixture<HostComponent>;
  } => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      root: fixture.nativeElement as HTMLElement,
      host: fixture.componentInstance,
      fixture,
    };
  };

  it('mostra messaggio, stato sync, versione, conteggi, zoom, misura e sessione', () => {
    const { root } = create();
    const footer = root.querySelector<HTMLElement>('.statusbar');

    expect(footer).not.toBeNull();
    expect(root.querySelector('.statusbar__message')?.getAttribute('role')).toBe('status');
    expect(root.querySelector('.statusbar__message')?.getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('.statusbar__message')?.textContent).toBe('Console pronta.');
    expect(root.querySelector('.statusbar__item--synced')?.textContent).toBe('synced');
    expect(footer?.textContent).toContain('v42');
    expect(footer?.textContent).toContain('3 token');
    expect(footer?.textContent).toContain('Zoom 125%');
    expect(footer?.textContent).toContain('Misura 3 m');
    expect(footer?.textContent).toContain('00:12:34');
  });

  it('aggiorna la classe di stato con syncStatus', () => {
    const { root, host, fixture } = create();

    host.syncStatus.set('pending');
    host.syncLabel.set('pending 2');
    fixture.detectChanges();

    expect(root.querySelector('.statusbar__item--pending')?.textContent).toBe('pending 2');
    expect(root.querySelector('.statusbar__item--synced')).toBeNull();
  });

  it('mostra il token selezionato solo quando presente', () => {
    const { root, host, fixture } = create();

    expect(root.textContent).not.toContain('Goblin');

    host.selectedToken.set({ label: 'Goblin', x: 4, y: -2 });
    fixture.detectChanges();

    expect(root.textContent).toContain('Goblin (4, -2)');
  });

  it('emette sync al click su Riallinea', () => {
    const { root, host } = create();
    const button = root.querySelector<HTMLButtonElement>('.statusbar__sync');

    expect(button?.textContent).toBe('Riallinea');
    button?.click();

    expect(host.synced).toBe(1);
  });
});
