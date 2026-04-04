export class LoadingScreen {
  private el: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private enterBtn: HTMLElement;

  constructor() {
    this.el = document.getElementById('loading-screen')!;
    this.bar = document.getElementById('loading-bar')!;
    this.status = document.getElementById('loading-status')!;
    this.enterBtn = document.getElementById('enter-prompt')!;
  }

  setTitle(name: string): void {
    const titleEl = document.getElementById('loading-title')!;
    titleEl.textContent = name;
  }

  updateProgress(loaded: number, total: number): void {
    const pct = total > 0 ? (loaded / total) * 100 : 0;
    this.bar.style.width = `${pct}%`;
    this.status.textContent = `작품 로딩 중... ${loaded}/${total}`;
  }

  showEnterButton(onClick: () => void): void {
    this.status.textContent = '준비 완료';
    this.bar.style.width = '100%';
    this.enterBtn.classList.add('visible');
    this.enterBtn.addEventListener('click', () => {
      onClick();
      this.hide();
    }, { once: true });
  }

  hide(): void {
    this.el.classList.add('hidden');
    setTimeout(() => {
      this.el.style.display = 'none';
    }, 600);
  }

  show(): void {
    this.el.style.display = 'flex';
    this.el.classList.remove('hidden');
    this.bar.style.width = '0%';
    this.status.textContent = '준비 중...';
    this.enterBtn.classList.remove('visible');
  }
}
