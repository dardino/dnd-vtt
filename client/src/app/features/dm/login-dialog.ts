import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormField, disabled, form, required, submit } from '@angular/forms/signals';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

interface LoginFormModel {
  readonly password: string;
}

@Component({
  selector: 'app-login-dialog',
  imports: [Button, Dialog, FormField],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginDialog {
  public readonly open = input(false);
  public readonly error = input<string | null>(null);
  public readonly busy = input(false);

  // `submit` è vietato da `@angular-eslint/no-output-native` (evento DOM nativo).
  public readonly login = output<string>();

  private readonly model = signal<LoginFormModel>({ password: '' });

  public readonly form = form(this.model, (path) => {
    required(path.password, { message: 'Inserisci la password DM.' });
    disabled(path.password, { when: () => this.busy() });
  });

  public constructor() {
    // Il dialog resta montato: a ogni apertura si riparte da un campo vuoto e pulito.
    effect(() => {
      if (this.open()) {
        this.form().reset({ password: '' });
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
        this.login.emit(this.form.password().value());
        return Promise.resolve(undefined);
      },
    });
  }
}
