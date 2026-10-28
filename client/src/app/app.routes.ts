import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((module) => module.HomePage),
  },
  {
    path: 'dm/campaigns/:campaignId/actors/new/pc',
    loadComponent: () => import('./features/character/character-wizard.page')
      .then((module) => module.CharacterWizardPage),
  },
  { path: '**', redirectTo: '' },
];
