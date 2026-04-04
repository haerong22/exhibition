export class HUD {
  private el: HTMLElement;
  private crosshair: HTMLElement;
  private isMobile: boolean;

  constructor(isMobile = false) {
    this.el = document.getElementById('hud')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.isMobile = isMobile;

    if (isMobile) {
      this.el.textContent = '조이스틱 이동 · 터치 시선 · 탭 작품 감상';
    }
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
