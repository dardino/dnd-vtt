import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormField, disabled, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

export interface CreateCampaignValues {
  name: string;
  description: string;
  advancementMode: 'milestone' | 'xp';
}

interface CreateCampaignFormModel {
  name: string;
  description: string;
  advancementMode: 'milestone' | 'xp';
}

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 4000;
const DEFAULT_MODEL: CreateCampaignFormModel = {
  name: '',
  description: '',
  advancementMode: 'milestone',
};

@Component({
  selector: 'app-create-campaign-dialog',
  imports: [Button, Dialog, FormField],
  templateUrl: './create-campaign-dialog.html',
  styleUrl: './create-campaign-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCampaignDialog {
  public readonly open = input(false);
  public readonly busy = input(false);
  public readonly dismissible = input(true);

  public readonly create = output<CreateCampaignValues>();
  public readonly closed = output<void>();

  private readonly model = signal<CreateCampaignFormModel>({ ...DEFAULT_MODEL });

  public readonly form = form(this.model, (path) => {
    required(path.name, { message: 'Inserisci il nome della campagna.' });
    maxLength(path.name, NAME_MAX_LENGTH, {
      message: `Il nome non può superare ${NAME_MAX_LENGTH} caratteri.`,
    });
    validate(path.name, ({ value }) => value().trim().length > 0
      ? null
      : { kind: 'blank', message: 'Inserisci il nome della campagna.' });
    maxLength(path.description, DESCRIPTION_MAX_LENGTH, {
      message: `L’ambientazione non può superare ${DESCRIPTION_MAX_LENGTH} caratteri.`,
    });
    disabled(path.name, { when: () => this.busy() });
    disabled(path.description, { when: () => this.busy() });
    disabled(path.advancementMode, { when: () => this.busy() });
  });

  public constructor() {
    // Il dialog resta montato: a ogni apertura si riparte dal modello pulito.
    effect(() => {
      if (this.open()) {
        this.form().reset({ ...DEFAULT_MODEL });
      }
    });
  }

  public requestSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    void submit(this.form, {
      action: () => {
        const values = this.form().value();
        this.create.emit({
          name: values.name.trim(),
          description: values.description.trim(),
          advancementMode: values.advancementMode,
        });
        return Promise.resolve(undefined);
      },
    });
  }

  public requestClose(): void {
    this.closed.emit();
  }
}
