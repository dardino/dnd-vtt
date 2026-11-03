import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { Campaign, MonsterStatblock } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignShellStore } from './campaign-shell.store';
import {
  AI_NAME_MAX_LENGTH,
  AI_TEXT_MAX_LENGTH,
  DmAiPanel,
} from './dm-ai-panel';
import { DmAuxStore } from './dm-aux.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';

const campaign = (): Campaign => ({
  id: CAMPAIGN_ID,
  name: 'La Valle',
  description: '',
  activeSceneId: null,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const statblock = (): MonsterStatblock => ({
  kind: 'monster',
  size: 'small',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  hp: { current: 7, max: 7, temp: 0 },
  speed: { walk: 30 },
  senses: {},
  languages: ['common'],
  conditions: [],
  creatureType: 'humanoid',
  cr: '1/4',
  tags: [],
  ac: 15,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  traits: [],
  actions: [],
  reactions: [],
});

describe('DmAiPanel', () => {
  const aiEnabled = signal(true);
  const aiMessage = signal('IA pronta');
  const aiText = signal('Goblin');
  const aiBusy = signal(false);
  const aiPreview = signal<MonsterStatblock | null>(null);
  const aiName = signal('Goblin');
  const activeCampaign = signal<Campaign | null>(campaign());
  const setText = vi.fn((value: string) => aiText.set(value));
  const setName = vi.fn((value: string) => aiName.set(value));
  const analyze = vi.fn().mockResolvedValue(undefined);
  const createMonster = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    aiEnabled.set(true);
    aiMessage.set('IA pronta');
    aiText.set('Goblin');
    aiBusy.set(false);
    aiPreview.set(null);
    aiName.set('Goblin');
    activeCampaign.set(campaign());
    [setText, setName, analyze, createMonster].forEach((fn) => fn.mockClear());

    TestBed.configureTestingModule({
      imports: [DmAiPanel],
      providers: [
        {
          provide: DmAuxStore,
          useValue: {
            aiEnabled,
            aiMessage,
            aiText,
            aiBusy,
            aiPreview,
            aiName,
            setText,
            setName,
            analyze,
            createMonster,
          },
        },
        { provide: CampaignShellStore, useValue: { activeCampaign } },
      ],
    });
  });

  const create = (): ComponentFixture<DmAiPanel> => {
    const fixture = TestBed.createComponent(DmAiPanel);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<DmAiPanel>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const textareaOf = (fixture: ComponentFixture<DmAiPanel>): HTMLTextAreaElement =>
    rootOf(fixture).querySelector('textarea') as HTMLTextAreaElement;

  const nameInputOf = (fixture: ComponentFixture<DmAiPanel>): HTMLInputElement =>
    rootOf(fixture).querySelector('input[type="text"]') as HTMLInputElement;

  const buttonOf = (fixture: ComponentFixture<DmAiPanel>, label: string): HTMLButtonElement => {
    const button = [...rootOf(fixture).querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.trim() === label);
    if (button === undefined) {
      throw new Error(`Bottone "${label}" non trovato`);
    }
    return button;
  };

  const fill = (
    fixture: ComponentFixture<DmAiPanel>,
    field: 'text' | 'name',
    value: string,
  ): void => {
    const input = field === 'text' ? textareaOf(fixture) : nameInputOf(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const blur = (fixture: ComponentFixture<DmAiPanel>, field: 'text' | 'name'): void => {
    const input = field === 'text' ? textareaOf(fixture) : nameInputOf(fixture);
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  };

  it('parte dai valori dello store e dal messaggio del provider', () => {
    const fixture = create();

    expect(rootOf(fixture).textContent).toContain('IA pronta');
    expect(textareaOf(fixture).value).toBe('Goblin');
    expect(buttonOf(fixture, 'Analizza statblock').disabled).toBe(false);
    expect(setText).not.toHaveBeenCalled();
    expect(setName).not.toHaveBeenCalled();
  });

  it('mostra il fallback quando il provider non è configurato', () => {
    aiEnabled.set(false);
    const fixture = create();

    expect(rootOf(fixture).textContent).toContain('Il provider IA non è configurato');
  });

  it('sincronizza form → store per statblock e nome', () => {
    aiPreview.set(statblock());
    const fixture = create();

    fill(fixture, 'text', 'Nuovo goblin');
    expect(setText).toHaveBeenLastCalledWith('Nuovo goblin');
    expect(aiText()).toBe('Nuovo goblin');

    fill(fixture, 'name', 'Goblin capo');
    expect(setName).toHaveBeenLastCalledWith('Goblin capo');
    expect(aiName()).toBe('Goblin capo');
  });

  it('riporta nel form il testo pulito da createMonster', () => {
    const fixture = create();
    fill(fixture, 'text', 'Statblock temporaneo');

    aiText.set('');
    fixture.detectChanges();

    expect(textareaOf(fixture).value).toBe('');
    expect(buttonOf(fixture, 'Analizza statblock').disabled).toBe(true);
  });

  it('disabilita Analizza con testo vuoto o richiesta in corso', () => {
    const fixture = create();

    fill(fixture, 'text', '   ');
    expect(buttonOf(fixture, 'Analizza statblock').disabled).toBe(true);

    fill(fixture, 'text', 'Goblin');
    aiBusy.set(true);
    fixture.detectChanges();

    expect(buttonOf(fixture, 'Analizza statblock').disabled).toBe(true);
  });

  it('analizza e crea il mostro con la campagna attiva', () => {
    aiPreview.set(statblock());
    const fixture = create();

    buttonOf(fixture, 'Analizza statblock').click();
    expect(analyze).toHaveBeenCalledWith(CAMPAIGN_ID);

    buttonOf(fixture, 'Crea mostro').click();
    expect(createMonster).toHaveBeenCalledWith(CAMPAIGN_ID);

    activeCampaign.set(null);
    fixture.detectChanges();
    buttonOf(fixture, 'Analizza statblock').click();
    buttonOf(fixture, 'Crea mostro').click();

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(createMonster).toHaveBeenCalledTimes(1);
  });

  it('limita statblock e nome e segnala gli errori dopo touched', () => {
    aiPreview.set(statblock());
    const fixture = create();

    fill(fixture, 'text', 'a'.repeat(AI_TEXT_MAX_LENGTH + 1));
    blur(fixture, 'text');

    expect(rootOf(fixture).textContent).toContain(
      `Lo statblock non può superare ${AI_TEXT_MAX_LENGTH} caratteri.`,
    );
    expect(textareaOf(fixture).getAttribute('aria-invalid')).toBe('true');
    expect(textareaOf(fixture).getAttribute('aria-describedby')).toBe('ai-text-error');
    expect(rootOf(fixture).querySelector('#ai-text-error')?.getAttribute('role')).toBe('alert');

    fill(fixture, 'name', 'b'.repeat(AI_NAME_MAX_LENGTH + 1));
    blur(fixture, 'name');

    expect(rootOf(fixture).textContent).toContain(
      `Il nome non può superare ${AI_NAME_MAX_LENGTH} caratteri.`,
    );
    expect(nameInputOf(fixture).getAttribute('aria-invalid')).toBe('true');
    expect(nameInputOf(fixture).getAttribute('aria-describedby')).toBe('ai-name-error');
    expect(rootOf(fixture).querySelector('#ai-name-error')?.getAttribute('role')).toBe('alert');
  });

  it('non segnala errori prima del blur', () => {
    aiPreview.set(statblock());
    const fixture = create();

    fill(fixture, 'text', 'a'.repeat(AI_TEXT_MAX_LENGTH + 1));

    expect(textareaOf(fixture).getAttribute('aria-invalid')).toBeNull();
    expect(rootOf(fixture).querySelector('#ai-text-error')).toBeNull();
  });
});
