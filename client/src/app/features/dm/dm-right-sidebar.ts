import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { TokenState } from '@dnd-vtt/shared';
import { AuthSessionsPanel } from './auth-sessions-panel';
import { CampaignShellStore } from './campaign-shell.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmLayoutStore, type SidebarSectionId } from './dm-layout.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore } from './regia.store';
import { ScreenList } from './screen-list';
import { SceneTokensStore } from './scene-tokens.store';
import { SidebarSection } from '../../components/sidebar-section/sidebar-section';
import { TokenList, type TokenHpChange } from './token-list';

/**
 * Pannello destro della console DM: token in mappa, schermi online e
 * dispositivi autenticati. Lo stato dei pannelli e dei token vive negli store;
 * qui restano solo i binding del template.
 */
@Component({
  selector: 'app-dm-right-sidebar',
  imports: [AuthSessionsPanel, ScreenList, SidebarSection, TokenList],
  templateUrl: './dm-right-sidebar.html',
  styleUrl: './dm-right-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmRightSidebar {
  public readonly layout = inject(DmLayoutStore);
  public readonly regia = inject(RegiaStore);
  public readonly tokensStore = inject(SceneTokensStore);
  public readonly ui = inject(DmUiStore);

  private readonly shell = inject(CampaignShellStore);
  private readonly campaign = inject(DmCampaignStore);

  public readonly tokens = this.tokensStore.tokens;
  public readonly sceneId = computed(() => this.campaign.activeScene()?.id ?? null);

  public toggleRight(): void {
    this.layout.toggleRight();
    this.layout.persistActive();
  }

  public toggleSection(section: SidebarSectionId): void {
    const opening = this.layout.toggleSection(section);
    this.layout.persistActive();
    if (opening && section === 'screens') {
      const campaign = this.shell.activeCampaign();
      if (campaign !== null) {
        void this.regia.loadScreens(campaign.id);
      }
    }
  }

  public changeTokenHp(event: TokenHpChange): void {
    void this.tokensStore.changeTokenHp(this.sceneId(), event.token, event.delta);
  }

  public toggleVisibility(token: TokenState): void {
    void this.tokensStore.toggleVisibility(this.sceneId(), token);
  }

  public removeToken(token: TokenState): void {
    void this.tokensStore.remove(this.sceneId(), token);
  }
}
