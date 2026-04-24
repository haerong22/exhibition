import type { ArtworkConfig } from '../types/exhibition';

interface ContentBlock {
  contentType: string;
  text?: { html?: string } | null;
  image?: { imageUrl?: string; width?: number; height?: number } | null;
}

interface ProjectDetail {
  title: string;
  owner: { nickname: string; introduction?: string };
  categories: { name: string }[];
  tags: string[];
  numberOfLikes: number;
  numberOfViews: number;
  createdAt: string;
  contentBlocks: ContentBlock[];
}

export class ArtworkInfoPanel {
  private panel: HTMLElement;
  private closeBtn: HTMLElement;
  private titleEl: HTMLElement;
  private artistEl: HTMLElement;
  private categoryEl: HTMLElement;
  private yearEl: HTMLElement;
  private descEl: HTMLElement;
  private tagsEl: HTMLElement;
  private statsEl: HTMLElement;
  private linkEl: HTMLAnchorElement;
  private bodyEl: HTMLElement;
  private loadingEl: HTMLElement;
  private prevBtn: HTMLElement;
  private nextBtn: HTMLElement;
  private onCloseCallback: (() => void) | null = null;
  private onPrevCallback: (() => void) | null = null;
  private onNextCallback: (() => void) | null = null;

  constructor() {
    this.panel = document.getElementById('artwork-panel')!;
    this.closeBtn = this.panel.querySelector('.close-btn')!;
    this.titleEl = this.panel.querySelector('.art-title')!;
    this.artistEl = this.panel.querySelector('.art-artist')!;
    this.categoryEl = this.panel.querySelector('.art-category')!;
    this.yearEl = this.panel.querySelector('.art-year')!;
    this.descEl = this.panel.querySelector('.art-desc')!;
    this.tagsEl = this.panel.querySelector('.art-tags')!;
    this.statsEl = this.panel.querySelector('.art-stats')!;
    this.linkEl = this.panel.querySelector('.art-link')!;
    this.bodyEl = this.panel.querySelector('.art-body')!;
    this.loadingEl = this.panel.querySelector('.art-loading')!;
    this.prevBtn = this.panel.querySelector('.nav-prev')!;
    this.nextBtn = this.panel.querySelector('.nav-next')!;

    this.closeBtn.addEventListener('click', () => {
      this.hide();
      this.onCloseCallback?.();
    });

    this.prevBtn.addEventListener('click', () => this.onPrevCallback?.());
    this.nextBtn.addEventListener('click', () => this.onNextCallback?.());

    window.addEventListener('keydown', (e) => {
      if (!this.panel.classList.contains('visible')) return;
      if (e.code === 'Escape') {
        this.hide();
        this.onCloseCallback?.();
      } else if (e.code === 'ArrowLeft') {
        this.onPrevCallback?.();
      } else if (e.code === 'ArrowRight') {
        this.onNextCallback?.();
      }
    });
  }

  setNavVisible(visible: boolean): void {
    this.prevBtn.style.display = visible ? '' : 'none';
    this.nextBtn.style.display = visible ? '' : 'none';
  }

  onPrev(cb: () => void): void { this.onPrevCallback = cb; }
  onNext(cb: () => void): void { this.onNextCallback = cb; }

  show(config: ArtworkConfig): void {
    // Show basic info immediately
    this.titleEl.textContent = config.titleKo ?? config.title;
    this.artistEl.textContent = config.artist;
    this.categoryEl.textContent = '';
    this.yearEl.textContent = '';
    this.descEl.textContent = '';
    this.tagsEl.innerHTML = '';
    this.statsEl.textContent = '';
    this.bodyEl.innerHTML = '';
    this.linkEl.href = `https://grafolio.ogq.me/project/detail/${config.id}`;
    this.linkEl.style.display = 'inline-block';
    this.loadingEl.textContent = '상세 정보 불러오는 중...';
    this.panel.classList.add('visible');
    this.panel.scrollTop = 0;

    // Fetch project detail from API
    this.fetchProjectDetail(config.id);
  }

  private async fetchProjectDetail(projectId: string): Promise<void> {
    try {
      const res = await fetch(`/api-proxy/proj/v1/projects/${projectId}`);
      if (!res.ok) throw new Error('API error');
      const data: ProjectDetail = await res.json();

      this.loadingEl.textContent = '';

      // Title & Artist
      this.titleEl.textContent = data.title;
      this.artistEl.textContent = data.owner.nickname;

      // Category
      if (data.categories.length > 0) {
        this.categoryEl.textContent = data.categories.map(c => c.name).join(', ');
      }

      // Description (owner introduction)
      if (data.owner.introduction) {
        this.descEl.textContent = data.owner.introduction;
      }

      // Date
      if (data.createdAt) {
        const date = new Date(data.createdAt);
        this.yearEl.textContent = date.toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      }

      // Tags
      if (data.tags.length > 0) {
        this.tagsEl.innerHTML = data.tags
          .map(tag => `<span class="art-tag">#${tag}</span>`)
          .join('');
      }

      // Stats
      const likes = data.numberOfLikes ?? 0;
      const views = data.numberOfViews ?? 0;
      this.statsEl.textContent = `조회 ${views.toLocaleString()} · 좋아요 ${likes.toLocaleString()}`;

      // Project body (text + images from contentBlocks)
      this.renderContentBlocks(data.contentBlocks);

    } catch {
      this.loadingEl.textContent = '상세 정보를 불러올 수 없습니다';
    }
  }

  private renderContentBlocks(blocks: ContentBlock[] | undefined): void {
    this.bodyEl.innerHTML = '';
    if (!blocks || blocks.length === 0) return;

    const parts: string[] = [];
    for (const block of blocks) {
      if (block.contentType === 'TEXT' && block.text?.html) {
        parts.push(this.sanitizeHtml(block.text.html));
      } else if (block.contentType === 'IMAGE' && block.image?.imageUrl) {
        const src = this.rewriteImageUrl(block.image.imageUrl);
        parts.push(`<img src="${this.escapeAttr(src)}" alt="" loading="lazy" />`);
      }
    }
    this.bodyEl.innerHTML = parts.join('');
  }

  // Route grafolio image CDN URLs through the local dev proxy so they can be loaded cross-origin.
  private rewriteImageUrl(url: string): string {
    return url.replace(/^https?:\/\/files\.grafolio\.ogq\.me/, '/img-proxy');
  }

  // Minimal HTML sanitization: strip <script>, inline event handlers, and javascript: URLs.
  // The content comes from a trusted source (grafolio) but we still defend against obvious XSS.
  private sanitizeHtml(html: string): string {
    const template = document.createElement('template');
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const toRemove: Element[] = [];
    let node = walker.nextNode() as Element | null;
    while (node) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
        toRemove.push(node);
      } else {
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value.trim().toLowerCase();
          if (name.startsWith('on') || (name === 'href' && value.startsWith('javascript:')) || (name === 'src' && value.startsWith('javascript:'))) {
            node.removeAttribute(attr.name);
          }
          if (name === 'src' && /^https?:\/\/files\.grafolio\.ogq\.me/.test(attr.value)) {
            node.setAttribute('src', this.rewriteImageUrl(attr.value));
          }
        }
      }
      node = walker.nextNode() as Element | null;
    }
    for (const el of toRemove) el.remove();
    return template.innerHTML;
  }

  private escapeAttr(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]!));
  }

  hide(): void {
    this.panel.classList.remove('visible');
  }

  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }
}
