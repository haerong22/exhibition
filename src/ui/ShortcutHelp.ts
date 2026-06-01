import { I18n } from '../systems/I18n';

// Fullscreen "?" overlay showing all controls/shortcuts.
// Toggled with `?` key. Closes on ESC, backdrop click, or close button.

interface Row {
  key: string;
  desc: string;
}

export class ShortcutHelp {
  private container: HTMLElement;
  private listEl: HTMLElement;
  private replayBtn: HTMLButtonElement;
  private isMobile: boolean;
  private replayCallback: (() => void) | null = null;

  constructor(isMobile: boolean) {
    this.isMobile = isMobile;
    this.container = document.createElement('div');
    this.container.id = 'shortcut-help';
    this.container.innerHTML = `
      <div class="sh-backdrop"></div>
      <div class="sh-card">
        <button class="sh-close" aria-label="닫기">&times;</button>
        <h2 class="sh-title"></h2>
        <ul class="sh-list"></ul>
        <button class="sh-replay" style="display:none"></button>
      </div>
    `;
    document.body.appendChild(this.container);

    this.listEl = this.container.querySelector('.sh-list') as HTMLElement;
    this.replayBtn = this.container.querySelector('.sh-replay') as HTMLButtonElement;
    const titleEl = this.container.querySelector('.sh-title') as HTMLElement;
    const closeBtn = this.container.querySelector('.sh-close') as HTMLElement;
    const backdrop = this.container.querySelector('.sh-backdrop') as HTMLElement;

    this.replayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = this.replayCallback;
      this.close();
      cb?.();
    });

    const refreshContent = () => {
      titleEl.textContent = I18n.t('help.title');
      this.replayBtn.textContent = I18n.t('help.replayWelcome');
      this.render();
    };
    refreshContent();
    I18n.onChange(refreshContent);

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    backdrop.addEventListener('click', () => this.close());

    window.addEventListener('keydown', (e) => {
      // Don't hijack when typing or another modal is open
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only open while in a gallery context (any of these UI elements is visible)
        if (!this.isInGalleryContext()) return;
        e.preventDefault();
        this.toggle();
      }
    });
  }

  // Heuristic: gallery UI is active if any of the per-session buttons is visible
  private isInGalleryContext(): boolean {
    const picker = document.getElementById('exhibition-picker');
    if (picker && !picker.classList.contains('hidden')) return false;
    const loading = document.getElementById('loading-screen');
    if (loading && loading.style.display !== 'none' && !loading.classList.contains('hidden')) return false;
    return true;
  }

  private render(): void {
    const rows: Row[] = this.isMobile
      ? [
          { key: I18n.current === 'ko' ? '좌측 조이스틱' : 'Left stick', desc: I18n.t('help.move') },
          { key: I18n.current === 'ko' ? '화면 드래그' : 'Drag screen', desc: I18n.t('help.look') },
          { key: I18n.current === 'ko' ? '탭' : 'Tap', desc: I18n.t('help.view') },
          { key: I18n.current === 'ko' ? '투어 버튼' : 'Tour button', desc: I18n.t('help.tour') },
          { key: I18n.current === 'ko' ? '사운드 버튼' : 'Sound button', desc: I18n.t('help.mute') },
          { key: I18n.current === 'ko' ? '카메라 버튼' : 'Camera button', desc: I18n.t('help.screenshot') },
          { key: I18n.current === 'ko' ? '★ 버튼' : 'Star button', desc: I18n.t('help.favorite') },
        ]
      : [
          { key: 'W A S D', desc: I18n.t('help.move') },
          { key: I18n.current === 'ko' ? '마우스' : 'Mouse', desc: I18n.t('help.look') },
          { key: I18n.current === 'ko' ? '클릭' : 'Click', desc: I18n.t('help.view') },
          { key: 'T', desc: I18n.t('help.tour') },
          { key: 'M', desc: I18n.t('help.mute') },
          { key: 'P', desc: I18n.t('help.screenshot') },
          { key: 'F', desc: I18n.t('help.favorite') },
          { key: 'G', desc: I18n.t('help.guestbook') },
          { key: 'ESC', desc: I18n.t('help.close') },
          { key: '?', desc: I18n.t('help.thisHelp') },
        ];

    this.listEl.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      const kbd = document.createElement('kbd');
      kbd.textContent = row.key;
      const span = document.createElement('span');
      span.textContent = row.desc;
      li.appendChild(kbd);
      li.appendChild(span);
      this.listEl.appendChild(li);
    }
  }

  setReplayCallback(cb: () => void): void {
    this.replayCallback = cb;
    this.replayBtn.style.display = '';
  }

  open(): void { this.container.classList.add('visible'); }
  close(): void { this.container.classList.remove('visible'); }
  toggle(): void { this.isOpen() ? this.close() : this.open(); }
  isOpen(): boolean { return this.container.classList.contains('visible'); }
}
