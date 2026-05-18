// Fullscreen zoom viewer for artwork images.
// Mouse wheel zooms around the cursor, drag pans, double-click resets.

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

export class ImageZoom {
  private container: HTMLElement;
  private img: HTMLImageElement;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private touchInitialDist = 0;
  private touchInitialScale = 1;

  constructor() {
    this.container = document.getElementById('image-zoom')!;
    this.img = this.container.querySelector('img')!;
    const closeBtn = this.container.querySelector('.zoom-close') as HTMLButtonElement;

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    // Click outside the image (on backdrop) closes
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.close();
    });

    // Pan
    this.container.addEventListener('pointerdown', (e) => {
      if (e.target !== this.img) return;
      this.dragging = true;
      this.dragStartX = e.clientX - this.tx;
      this.dragStartY = e.clientY - this.ty;
      this.container.classList.add('dragging');
      this.container.setPointerCapture(e.pointerId);
    });
    this.container.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.tx = e.clientX - this.dragStartX;
      this.ty = e.clientY - this.dragStartY;
      this.applyTransform();
    });
    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.container.classList.remove('dragging');
      try { this.container.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    this.container.addEventListener('pointerup', endDrag);
    this.container.addEventListener('pointercancel', endDrag);

    // Wheel zoom — anchor on cursor position
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
      this.zoomAt(e.clientX, e.clientY, newScale);
    }, { passive: false });

    // Double click resets
    this.img.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.reset();
    });

    // Pinch zoom (touch)
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.touchInitialDist = this.touchDist(e);
        this.touchInitialScale = this.scale;
      }
    }, { passive: true });
    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = this.touchDist(e);
        if (this.touchInitialDist > 0) {
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
            this.touchInitialScale * (dist / this.touchInitialDist)));
          // Anchor on midpoint between fingers
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.zoomAt(midX, midY, newScale);
        }
      }
    }, { passive: false });

    // ESC closes
    window.addEventListener('keydown', (e) => {
      if (!this.container.classList.contains('visible')) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  private touchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  open(imageUrl: string, alt = ''): void {
    this.img.src = imageUrl;
    this.img.alt = alt;
    this.reset();
    this.container.classList.add('visible');
  }

  close(): void {
    this.container.classList.remove('visible');
    // Free memory on close
    this.img.removeAttribute('src');
  }

  isOpen(): boolean {
    return this.container.classList.contains('visible');
  }

  private reset(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.applyTransform();
  }

  // Zoom such that the point (cx, cy) in screen coords stays anchored on the image
  private zoomAt(cx: number, cy: number, newScale: number): void {
    const rect = this.img.getBoundingClientRect();
    // Image center in screen coords
    const ix = rect.left + rect.width / 2;
    const iy = rect.top + rect.height / 2;
    // Offset of cursor from image center, in the current scale
    const dx = cx - ix;
    const dy = cy - iy;
    const ratio = newScale / this.scale;
    // Adjust translation so the point at (cx, cy) stays fixed during the scale change
    this.tx -= dx * (ratio - 1);
    this.ty -= dy * (ratio - 1);
    this.scale = newScale;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }
}
