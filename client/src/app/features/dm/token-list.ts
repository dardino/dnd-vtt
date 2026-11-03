import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TokenState } from '@dnd-vtt/shared';

export interface TokenHpChange {
  token: TokenState;
  delta: number;
}

@Component({
  selector: 'app-token-list',
  templateUrl: './token-list.html',
  styleUrl: './token-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokenList {
  public readonly tokens = input.required<readonly TokenState[]>();
  public readonly selectedTokenId = input<string | null>(null);
  public readonly center = output<TokenState>();
  public readonly changeHp = output<TokenHpChange>();
  public readonly toggleVisibility = output<TokenState>();
  public readonly remove = output<TokenState>();
}
