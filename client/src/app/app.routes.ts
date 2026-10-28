import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dm' },
  {
    path: 'dm',
    loadComponent: () => import('./features/dm/dm-shell.page').then((module) => module.DmShellPage),
  },
  {
    path: 'dm/campaigns/:campaignId',
    loadComponent: () => import('./features/dm/dm-shell.page').then((module) => module.DmShellPage),
  },
  {
    path: 'dm/campaigns/:campaignId/actors/new/pc',
    loadComponent: () => import('./features/character/character-wizard.page')
      .then((module) => module.CharacterWizardPage),
  },
  { path: '**', redirectTo: 'dm' },
];
