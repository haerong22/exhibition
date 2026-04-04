import type { ArtworkConfig } from '../types/exhibition';

interface ProjectDetail {
  title: string;
  owner: { nickname: string; introduction?: string };
  categories: { name: string }[];
  tags: string[];
  numberOfLikes: number;
  numberOfViews: number;
  createdAt: string;
  contentBlocks: { contentType: string; image?: { width: number; height: number } }[];
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
  private loadingEl: HTMLElement;
  private onCloseCallback: (() => void) | null = null;

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
    this.loadingEl = this.panel.querySelector('.art-loading')!;

    this.closeBtn.addEventListener('click', () => {
      this.hide();
      this.onCloseCallback?.();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.panel.classList.contains('visible')) {
        this.hide();
        this.onCloseCallback?.();
      }
    });
  }

  show(config: ArtworkConfig): void {
    // Show basic info immediately
    this.titleEl.textContent = config.titleKo ?? config.title;
    this.artistEl.textContent = config.artist;
    this.categoryEl.textContent = '';
    this.yearEl.textContent = '';
    this.descEl.textContent = '';
    this.tagsEl.innerHTML = '';
    this.statsEl.textContent = '';
    this.loadingEl.textContent = '상세 정보 불러오는 중...';
    this.panel.classList.add('visible');

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

    } catch {
      this.loadingEl.textContent = '상세 정보를 불러올 수 없습니다';
    }
  }

  hide(): void {
    this.panel.classList.remove('visible');
  }

  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }
}
