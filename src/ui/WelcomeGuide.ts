import { I18n } from '../systems/I18n';

const STORAGE_KEY = 'gallery-welcome-seen';

interface Step {
  title: string;
  body: string;
}

export class WelcomeGuide {
  private container: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private dotsEl: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private steps: Step[] = [];
  private current = 0;
  private isMobile: boolean;

  constructor(isMobile: boolean) {
    this.isMobile = isMobile;
    this.container = document.createElement('div');
    this.container.id = 'welcome-guide';
    this.container.innerHTML = `
      <div class="wg-card">
        <button class="wg-close" aria-label="닫기">&times;</button>
        <div class="wg-step"></div>
        <h3 class="wg-title"></h3>
        <p class="wg-body"></p>
        <div class="wg-dots"></div>
        <div class="wg-actions">
          <button class="wg-skip"></button>
          <button class="wg-next"></button>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.titleEl = this.container.querySelector('.wg-title') as HTMLElement;
    this.bodyEl = this.container.querySelector('.wg-body') as HTMLElement;
    this.dotsEl = this.container.querySelector('.wg-dots') as HTMLElement;
    this.nextBtn = this.container.querySelector('.wg-next') as HTMLButtonElement;
    this.skipBtn = this.container.querySelector('.wg-skip') as HTMLButtonElement;
    const closeBtn = this.container.querySelector('.wg-close') as HTMLButtonElement;

    this.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
    this.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });

    // Re-render on locale change while visible
    I18n.onChange(() => {
      if (this.isVisible()) {
        this.steps = this.buildSteps();
        this.render();
      }
    });
  }

  hasSeen(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch { return false; }
  }

  show(): void {
    this.steps = this.buildSteps();
    this.current = 0;
    this.render();
    this.container.classList.add('visible');
  }

  private finish(): void {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
    this.container.classList.remove('visible');
  }

  isVisible(): boolean {
    return this.container.classList.contains('visible');
  }

  private next(): void {
    if (this.current < this.steps.length - 1) {
      this.current++;
      this.render();
    } else {
      this.finish();
    }
  }

  private buildSteps(): Step[] {
    return this.isMobile
      ? [
          { title: I18n.t('welcome.move.title'), body: I18n.t('welcome.move.body.mobile') },
          { title: I18n.t('welcome.look.title'), body: I18n.t('welcome.look.body.mobile') },
          { title: I18n.t('welcome.view.title'), body: I18n.t('welcome.view.body.mobile') },
        ]
      : [
          { title: I18n.t('welcome.move.title'), body: I18n.t('welcome.move.body.desktop') },
          { title: I18n.t('welcome.look.title'), body: I18n.t('welcome.look.body.desktop') },
          { title: I18n.t('welcome.view.title'), body: I18n.t('welcome.view.body.desktop') },
          { title: I18n.t('welcome.more.title'), body: I18n.t('welcome.more.body.desktop') },
        ];
  }

  private render(): void {
    const step = this.steps[this.current];
    if (!step) return;
    const total = this.steps.length;
    const isLast = this.current === total - 1;

    (this.container.querySelector('.wg-step') as HTMLElement).textContent =
      I18n.t('welcome.step', { current: this.current + 1, total });
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;

    this.dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'wg-dot' + (i === this.current ? ' active' : '');
      this.dotsEl.appendChild(dot);
    }

    this.nextBtn.textContent = isLast ? I18n.t('welcome.start') : I18n.t('welcome.next');
    this.skipBtn.textContent = I18n.t('welcome.skip');
    this.skipBtn.style.display = isLast ? 'none' : '';
  }
}
