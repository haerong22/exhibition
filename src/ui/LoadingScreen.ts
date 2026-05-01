export class LoadingScreen {
  private el: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private enterBtn: HTMLElement;
  // Stage-based progress: each stage occupies a slice of the overall bar
  private stageStart = 0;
  private stageEnd = 1;

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

  // Begin a stage: messages and bar fill within [start, end] of total range (0~1)
  setStage(label: string, start: number, end: number): void {
    this.stageStart = start;
    this.stageEnd = end;
    this.status.textContent = label;
    this.bar.style.width = `${start * 100}%`;
  }

  // Update progress within current stage
  updateProgress(loaded: number, total: number): void {
    const fraction = total > 0 ? loaded / total : 0;
    const pct = (this.stageStart + (this.stageEnd - this.stageStart) * fraction) * 100;
    this.bar.style.width = `${pct}%`;
    if (total > 0) {
      this.status.textContent = `작품 텍스처 로딩 ${loaded} / ${total}`;
    }
  }

  setMessage(msg: string): void {
    this.status.textContent = msg;
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
    this.stageStart = 0;
    this.stageEnd = 1;
  }
}
