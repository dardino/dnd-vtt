import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { CampaignShellStore } from './campaign-shell.store';
import { DmAuxStore } from './dm-aux.store';

interface DmAiFormModel {
  text: string;
  name: string;
}

/** Limiti del form, condivisi con template e test. */
export const AI_TEXT_MAX_LENGTH = 20_000;
export const AI_NAME_MAX_LENGTH = 120;

/**
 * Sezione "Chat IA" del pannello sinistro: statblock da analizzare e anteprima
 * del mostro. Il modello del form è l'unico stato locale, sincronizzato con
 * `DmAuxStore` in entrambe le direzioni; le chiamate usano la campagna attiva.
 */
@Component({
  selector: 'app-dm-ai-panel',
  imports: [FormField],
  templateUrl: './dm-ai-panel.html',
  styleUrl: './dm-ai-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmAiPanel {
  private readonly aux = inject(DmAuxStore);
  private readonly shell = inject(CampaignShellStore);

  private readonly model = signal<DmAiFormModel>({
    text: this.aux.aiText(),
    name: this.aux.aiName(),
  });

  public readonly form = form(this.model, (path) => {
    maxLength(path.text, AI_TEXT_MAX_LENGTH, {
      message: `Lo statblock non può superare ${AI_TEXT_MAX_LENGTH} caratteri.`,
    });
    maxLength(path.name, AI_NAME_MAX_LENGTH, {
      message: `Il nome non può superare ${AI_NAME_MAX_LENGTH} caratteri.`,
    });
  });

  public readonly aiEnabled = this.aux.aiEnabled;
  public readonly aiMessage = this.aux.aiMessage;
  public readonly aiBusy = this.aux.aiBusy;
  public readonly aiPreview = this.aux.aiPreview;

  public constructor() {
    // form → store: lo store si legge fuori dalle dipendenze, così un reset
    // esterno (createMonster) non riattiva l'effect con il form ancora vecchio.
    effect(() => {
      const value = this.form().value();
      untracked(() => {
        if (value.text !== this.aux.aiText()) {
          this.aux.setText(value.text);
        }
        if (value.name !== this.aux.aiName()) {
          this.aux.setName(value.name);
        }
      });
    });

    // store → form: copre il testo pulito da `createMonster` e il nome di default.
    effect(() => {
      const current = this.form().value();
      const next: DmAiFormModel = {
        text: this.aux.aiText(),
        name: this.aux.aiName(),
      };
      if (current.text !== next.text || current.name !== next.name) {
        this.form().reset(next);
      }
    });
  }

  public async analyze(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.aux.analyze(campaign.id);
  }

  public async createMonster(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.aux.createMonster(campaign.id);
  }
}
