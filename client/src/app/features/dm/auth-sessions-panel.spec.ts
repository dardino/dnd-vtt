import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { AuthSession } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { AuthSessionsPanel } from './auth-sessions-panel';

const CURRENT_ID = '0190f000-0000-7000-8000-000000000001';
const OTHER_ID = '0190f000-0000-7000-8000-000000000002';

const session = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  id: CURRENT_ID,
  createdAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: '2026-11-03T09:30:00.000Z',
  expiresAt: '2026-11-08T10:00:00.000Z',
  current: true,
  userAgent: null,
  ...overrides,
});

describe('AuthSessionsPanel', () => {
  const sessions = vi.fn<() => Promise<AuthSession[]>>();
  const revokeSession = vi.fn<(id: string) => Promise<void>>();
  const show = vi.fn();

  beforeEach(() => {
    sessions.mockReset();
    revokeSession.mockReset();
    show.mockReset();
    sessions.mockResolvedValue([
      session(),
      session({ id: OTHER_ID, current: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    ]);
    revokeSession.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [AuthSessionsPanel],
      providers: [
        { provide: AuthService, useValue: { sessions, revokeSession } },
        { provide: ToastService, useValue: { show } },
      ],
    });
  });

  const create = async (): Promise<ComponentFixture<AuthSessionsPanel>> => {
    const fixture = TestBed.createComponent(AuthSessionsPanel);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<AuthSessionsPanel>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('elenca le sessioni con dispositivo, date e badge corrente', async () => {
    const fixture = await create();
    const root = rootOf(fixture);

    expect(root.querySelectorAll('li')).toHaveLength(2);
    expect(root.textContent).toContain('Dispositivo sconosciuto');
    expect(root.textContent).toContain('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(root.textContent).toContain('Questo dispositivo');
    expect(root.textContent).toContain('Creata');
    expect(root.textContent).toContain('Ultima attività');
  });

  it('revoca una sessione e aggiorna la lista', async () => {
    const fixture = await create();
    const root = rootOf(fixture);
    const button = root.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe(
      'Revoca Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    );
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revokeSession).toHaveBeenCalledWith(OTHER_ID);
    expect(root.querySelectorAll('li')).toHaveLength(1);
    expect(root.textContent).not.toContain('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(show).toHaveBeenCalledWith('Sessione revocata.', 'success');
  });

  it('mostra un alert quando il caricamento fallisce', async () => {
    sessions.mockRejectedValue(new Error('offline'));
    const fixture = await create();
    const alert = rootOf(fixture).querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('Impossibile caricare le sessioni attive.');
  });

  it('non mostra il pulsante Revoca per la sessione corrente', async () => {
    const fixture = await create();
    const currentRow = rootOf(fixture).querySelector('li') as HTMLLIElement;

    expect(currentRow.textContent).toContain('Questo dispositivo');
    expect(currentRow.querySelector('button')).toBeNull();
  });
});
