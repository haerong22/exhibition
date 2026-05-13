import { I18n } from '../systems/I18n';

export class HUD {
  private el: HTMLElement;
  private crosshair: HTMLElement;
  private isMobile: boolean;

  constructor(isMobile = false) {
    this.el = document.getElementById('hud')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.isMobile = isMobile;

    // Mobile gets a shorter HUD string; toggle the data-i18n key so applyToDom picks the right one
    if (isMobile) this.el.dataset.i18n = 'hud.mobile';
    this.el.textContent = I18n.t(this.el.dataset.i18n!);
    I18n.onChange(() => { this.el.textContent = I18n.t(this.el.dataset.i18n!); });
  }

  show(): void {
    this.el.classList.add('visible');
    if (!this.isMobile) {
      this.crosshair.classList.add('visible');
    }
  }

  hide(): void {
    this.el.classList.remove('visible');
    this.crosshair.classList.remove('visible');
  }
}
