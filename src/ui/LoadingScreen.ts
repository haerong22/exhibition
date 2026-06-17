import { I18n } from '../systems/I18n';

export class LoadingScreen {
  private el: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private enterBtn: HTMLElement;
  private controls: HTMLElement;
  private description: HTMLElement;
  private credits: HTMLElement;
  private meta: HTMLElement;
  // Stage-based progress: each stage occupies a slice of the overall bar
  private stageStart = 0;
  private stageEnd = 1;

  constructor(isMobile = false) {
    this.el = document.getElementById('loading-screen')!;
    this.bar = document.getElementById('loading-bar')!;
    this.status = document.getElementById('loading-status')!;
    this.enterBtn = document.getElementById('enter-prompt')!;
    this.controls = document.getElementById('loading-controls')!;
    this.description = document.getElementById('loading-description')!;
    this.credits = document.getElementById('loading-credits')!;
    this.meta = document.getElementById('loading-meta')!;
    this.populateControls(isMobile);
  }

  setDescription(text: string | undefined | null): void {
    if (text && text.trim()) {
      this.description.textContent = text.trim();
      this.description.classList.add('has-content');
    } else {
      this.description.textContent = '';
      this.description.classList.remove('has-content');
    }
  }

  setMeta(opts: {
    artworkCount?: number;
    width?: number;
    height?: number;
    favorites?: number;
    guestbook?: number;
    likes?: number;
  }): void {
    const parts: string[] = [];
    if (typeof opts.artworkCount === 'number' && opts.artworkCount > 0) {
      parts.push(this.escape(I18n.t('meta.artworkCount', { n: opts.artworkCount })));
    }
    if (opts.width && opts.height) {
      parts.push(this.escape(I18n.t('meta.size', { w: opts.width, h: opts.height })));
    }
    // Engagement stats — only show pills when > 0, color-coded
    const stats: string[] = [];
    if (opts.favorites && opts.favorites > 0) {
      stats.push(`<span class="meta-stat meta-fav">★ ${opts.favorites}</span>`);
    }
    if (opts.guestbook && opts.guestbook > 0) {
      stats.push(`<span class="meta-stat meta-gb">💬 ${opts.guestbook}</span>`);
    }
    if (opts.likes && opts.likes > 0) {
      stats.push(`<span class="meta-stat meta-like">♥ ${opts.likes}</span>`);
    }
    if (parts.length === 0 && stats.length === 0) {
      this.meta.innerHTML = '';
      this.meta.classList.remove('has-content');
      return;
    }
    const baseHtml = parts.map((p) => `<span>${p}</span>`).join('<span class="sep">·</span>');
    const statsHtml = stats.length > 0 ? `<span class="meta-stats">${stats.join('')}</span>` : '';
    this.meta.innerHTML = baseHtml + statsHtml;
    this.meta.classList.add('has-content');
  }

  setCredits(opts: { artist?: string | null; curator?: string | null }): void {
    const artist = opts.artist?.trim();
    const curator = opts.curator?.trim();
    if (!artist && !curator) {
      this.credits.innerHTML = '';
      this.credits.classList.remove('has-content');
      return;
    }
    const parts: string[] = [];
    if (artist) parts.push(`<span>${this.escape(I18n.t('credit.artist', { name: artist }))}</span>`);
    if (curator) parts.push(`<span>${this.escape(I18n.t('credit.curator', { name: curator }))}</span>`);
    this.credits.innerHTML = parts.join('<span class="sep">·</span>');
    this.credits.classList.add('has-content');
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  private populateControls(isMobile: boolean): void {
    const list = this.controls.querySelector('ul');
    if (!list) return;
    const render = () => {
      const items = isMobile
        ? [
            { key: I18n.current === 'ko' ? '조이스틱' : 'Stick', desc: I18n.t('controls.mobile.move') },
            { key: I18n.current === 'ko' ? '드래그' : 'Drag', desc: I18n.t('controls.mobile.look') },
            { key: I18n.current === 'ko' ? '탭' : 'Tap', desc: I18n.t('controls.mobile.view') },
          ]
        : [
            { key: 'WASD', desc: I18n.t('controls.desktop.move') },
            { key: I18n.current === 'ko' ? '마우스' : 'Mouse', desc: I18n.t('controls.desktop.look') },
            { key: I18n.current === 'ko' ? '클릭' : 'Click', desc: I18n.t('controls.desktop.view') },
            { key: 'T', desc: I18n.t('controls.desktop.tour') },
            { key: 'M', desc: I18n.t('controls.desktop.mute') },
            { key: 'ESC', desc: I18n.t('controls.desktop.close') },
          ];
      list.innerHTML = '';
      for (const item of items) {
        const li = document.createElement('li');
        const kbd = document.createElement('kbd');
        kbd.textContent = item.key;
        const span = document.createElement('span');
        span.textContent = item.desc;
        li.appendChild(kbd);
        li.appendChild(span);
        list.appendChild(li);
      }
    };
    render();
    I18n.onChange(render);
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
      this.status.textContent = I18n.t('loading.progress.textures', { loaded, total });
    }
  }

  setMessage(msg: string): void {
    this.status.textContent = msg;
  }

  showEnterButton(onClick: () => void): void {
    this.status.textContent = I18n.t('loading.ready');
    this.bar.style.width = '100%';
    this.enterBtn.classList.add('visible');
    this.controls.classList.add('visible');
    this.description.classList.add('visible');
    this.credits.classList.add('visible');
    this.meta.classList.add('visible');
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
    // Start hidden so the next frame can transition opacity 0 → 1 (fade in)
    this.el.classList.add('hidden');
    this.bar.style.width = '0%';
    this.status.textContent = I18n.t('loading.preparing');
    this.enterBtn.classList.remove('visible');
    this.controls.classList.remove('visible');
    this.description.classList.remove('visible');
    this.credits.classList.remove('visible');
    this.meta.classList.remove('visible');
    this.setDescription(null);
    this.setCredits({});
    this.setMeta({});
    this.stageStart = 0;
    this.stageEnd = 1;
    // Force reflow so the next class removal triggers the CSS opacity transition
    void this.el.offsetHeight;
    requestAnimationFrame(() => {
      this.el.classList.remove('hidden');
    });
  }
}
