import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { SrdMonster } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { MeasurementService } from '../../core/ui/measurement.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { ActorWizardPage } from './actor-wizard.page';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000020';

const goblin = (): SrdMonster => ({
  id: 'goblin',
  name: 'Goblin',
  creatureType: 'Humanoid (goblinoid)',
  size: 'small',
  cr: '1/4',
  ac: 15,
  hp: { max: 7, formula: '2d6' },
  speed: { walk: 30 },
  senses: { darkvision: 60 },
  languages: ['Comune', 'Goblin'],
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  traits: [{ name: 'Fuga agile', description: 'Si nasconde.', recharge: 'none' }],
  actions: [],
  reactions: [],
});

describe('ActorWizardPage con Signal Forms', () => {
  const createActor = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    createActor.mockReset();
    createActor.mockResolvedValue({ id: ACTOR_ID });
    navigate.mockReset();
    navigate.mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [ActorWizardPage],
      providers: [
        { provide: ActorService, useValue: { createActor } },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
        {
          provide: SrdCatalogService,
          useValue: {
            load: vi.fn(() => Promise.resolve()),
            catalog: () => null,
            loading: () => false,
            error: () => null,
          },
        },
      ],
    });
  });

  const createPage = (
    kind: 'monster' | 'npc' = 'monster',
  ): ComponentFixture<ActorWizardPage> => {
    const fixture = TestBed.createComponent(ActorWizardPage);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture;
  };

  it('blocca il salvataggio con nome vuoto o composto solo da spazi', async () => {
    const page = createPage().componentInstance;

    expect(page.form.name().value()).toBe('');
    expect(page.canSave()).toBe(false);
    await page.save();
    expect(createActor).not.toHaveBeenCalled();

    page.form.name().value.set('   ');
    expect(page.form.name().invalid()).toBe(true);
    expect(page.form.name().errors()[0]?.message)
      .toBe('Il nome non può essere composto solo da spazi.');
    expect(page.canSave()).toBe(false);
    await page.save();
    expect(createActor).not.toHaveBeenCalled();
  });

  it('valida punti ferita, classe armatura e velocità', () => {
    const page = createPage().componentInstance;
    page.form.name().value.set('Goblin');

    page.form.hpMax().value.set(0);
    expect(page.form.hpMax().invalid()).toBe(true);
    expect(page.form.hpMax().errors()[0]?.message)
      .toBe('I punti ferita massimi devono essere almeno 1.');

    page.form.hpMax().value.set(1);
    page.form.ac().value.set(-1);
    expect(page.form.ac().invalid()).toBe(true);
    expect(page.form.ac().errors()[0]?.message)
      .toBe('La classe armatura non può essere negativa.');

    page.form.ac().value.set(0);
    page.form.speed().value.set(-1);
    expect(page.form.speed().invalid()).toBe(true);
    expect(page.form.speed().errors()[0]?.message)
      .toBe('La velocità non può essere negativa.');
    expect(page.canSave()).toBe(false);

    page.form.speed().value.set(0);
    expect(page.canSave()).toBe(true);

    page.form.abilities.str().value.set(0);
    expect(page.form.abilities.str().invalid()).toBe(true);
    page.form.abilities.str().value.set(31);
    expect(page.form.abilities.str().invalid()).toBe(true);
    page.form.abilities.str().value.set(20);
    expect(page.form.abilities.str().invalid()).toBe(false);

    page.form.senses.darkvision().value.set(-1);
    expect(page.form.senses.darkvision().invalid()).toBe(true);
    page.form.senses.darkvision().value.set(0);
    expect(page.form.senses.darkvision().invalid()).toBe(false);
  });

  it('converte velocità e sensi al cambio di unità', () => {
    const fixture = createPage();
    const page = fixture.componentInstance;
    const units = TestBed.inject(MeasurementService);

    units.set('metric');
    fixture.detectChanges();
    expect(page.form.speed().value()).toBe(9);
    expect(page.statblock().speed.walk).toBe(30);

    page.form.senses.darkvision().value.set(18);
    expect(page.statblock().senses.darkvision).toBe(60);

    units.set('imperial');
    fixture.detectChanges();
    expect(page.form.speed().value()).toBe(30);
    expect(page.form.senses.darkvision().value()).toBe(60);
  });

  it('invia il payload atteso quando il form è valido', async () => {
    const page = createPage().componentInstance;
    page.form.name().value.set('  Tizio  ');
    page.form.hpMax().value.set(12);
    page.form.ac().value.set(14);
    page.form.speed().value.set(25);
    page.form.notes().value.set('Nota del DM');

    await page.save();

    expect(createActor).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      kind: 'monster',
      name: 'Tizio',
      statblock: {
        kind: 'monster',
        size: 'medium',
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        speed: { walk: 25 },
        senses: {},
        languages: ['Comune'],
        conditions: [],
        creatureType: 'Humanoid',
        cr: '0',
        tags: [],
        ac: 14,
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
        traits: [],
        actions: [],
        reactions: [],
      },
      dmNotes: 'Nota del DM',
    });
    expect(navigate).toHaveBeenCalledWith([
      '/dm/campaigns', CAMPAIGN_ID, 'actors', ACTOR_ID, 'sheet',
    ]);
  });

  it('importa un mostro SRD nel form e porta al passo caratteristiche', () => {
    const page = createPage().componentInstance;

    page.importMonster(goblin());

    expect(page.step()).toBe(2);
    expect(page.form.actorKind().value()).toBe('monster');
    expect(page.form.name().value()).toBe('Goblin');
    expect(page.form.creatureType().value()).toBe('Humanoid (goblinoid)');
    expect(page.form.cr().value()).toBe('1/4');
    expect(page.form.size().value()).toBe('small');
    expect(page.form.hpMax().value()).toBe(7);
    expect(page.form.ac().value()).toBe(15);
    expect(page.form.speed().value()).toBe(30);
    expect(page.form.senses().value()).toEqual({
      darkvision: 60,
      blindsight: 0,
      tremorsense: 0,
      truesight: 0,
    });
    expect(page.form.abilities().value()).toEqual({
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    });
    expect(page.form.languages().value()).toBe('Comune, Goblin');
    expect(page.canSave()).toBe(true);
  });

  it('espone aria-invalid e aria-describedby dopo il blur sul nome', () => {
    const fixture = createPage();
    const page = fixture.componentInstance;
    const input = (fixture.nativeElement as HTMLElement)
      .querySelector('input[type="text"]') as HTMLInputElement;

    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(page.form.name().invalid()).toBe(true);
    expect(page.form.name().touched()).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(page.form.name().touched()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('actor-name-error');
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('Il nome non può essere composto solo da spazi.');
  });
});
