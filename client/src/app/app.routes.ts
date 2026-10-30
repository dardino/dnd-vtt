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
  {
    path: 'dm/campaigns/:campaignId/actors/new/:kind',
    loadComponent: () => import('./features/actor/actor-wizard.page')
      .then((module) => module.ActorWizardPage),
  },
  {
    path: 'dm/campaigns/:campaignId/actors/:actorId/sheet',
    loadComponent: () => import('./features/actor/actor-sheet.page')
      .then((module) => module.ActorSheetPage),
  },
  {
    path: 'display/:code',
    loadComponent: () => import('./features/display/display.page')
      .then((module) => module.DisplayPage),
  },
  {
    path: 'play/:token',
    loadComponent: () => import('./features/player/player.page')
      .then((module) => module.PlayerPage),
  },
  { path: '**', redirectTo: 'dm' },
];
