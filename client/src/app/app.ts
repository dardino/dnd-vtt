import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  public readonly theme = inject(ThemeService);
  public readonly year = new Date().getFullYear();
  private readonly router = inject(Router);

  public displayMode(): boolean {
    return this.router.url.startsWith('/display/') || this.router.url.startsWith('/play/');
  }
}
