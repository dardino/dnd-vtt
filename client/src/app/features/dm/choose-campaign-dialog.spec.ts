import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Campaign } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChooseCampaignDialog } from './choose-campaign-dialog';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000010';

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: CAMPAIGN_ID,
  name: 'E2E Campagna',
  description: 'Una cava sotto la città.',
  activeSceneId: null,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

describe('ChooseCampaignDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [ChooseCampaignDialog] });
  });

  const create = (options: {
    open?: boolean;
    campaigns?: readonly Campaign[];
    dismissible?: boolean;
  } = {}): ComponentFixture<ChooseCampaignDialog> => {
    const fixture = TestBed.createComponent(ChooseCampaignDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('campaigns', options.campaigns ?? [campaign()]);
    fixture.componentRef.setInput('dismissible', options.dismissible ?? true);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<ChooseCampaignDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('elenca le campagne con testi invariati', () => {
    const fixture = create({
      campaigns: [
        campaign(),
        campaign({
          id: '0190f000-0000-7000-8000-000000000011',
          name: 'Seconda',
          description: '',
          advancementMode: 'xp',
        }),
      ],
    });
    const root = rootOf(fixture);

    expect(root.textContent).toContain('Scegli campagna');
    expect(root.querySelectorAll('.campaign-card')).toHaveLength(2);
    expect(root.textContent).toContain('E2E Campagna');
    expect(root.textContent).toContain('Una cava sotto la città.');
    expect(root.textContent).toContain('Nessuna descrizione');
    expect(root.textContent).toContain('xp');
  });

  it('emette l id della campagna scelta', () => {
    const fixture = create();
    const emitted: string[] = [];
    fixture.componentInstance.selectCampaign.subscribe((id) => {
      emitted.push(id);
    });

    rootOf(fixture).querySelector('.campaign-card')?.dispatchEvent(new Event('click'));

    expect(emitted).toEqual([CAMPAIGN_ID]);
  });

  it('emette create dal pulsante Nuova campagna', () => {
    const fixture = create();
    let emitted = 0;
    fixture.componentInstance.create.subscribe(() => {
      emitted += 1;
    });

    const button = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === 'Nuova campagna');
    button?.click();

    expect(emitted).toBe(1);
  });

  it('emette closed dal pulsante di chiusura quando dismissible', () => {
    const fixture = create();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => {
      closed += 1;
    });

    const button = rootOf(fixture).querySelector('.dialog__close') as HTMLButtonElement;
    button.click();

    expect(closed).toBe(1);
  });

  it('non permette la chiusura quando non dismissible', () => {
    const fixture = create({ dismissible: false });

    expect(rootOf(fixture).querySelector('.dialog__close')).toBeNull();
  });
});
