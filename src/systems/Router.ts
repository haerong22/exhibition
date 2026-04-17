export interface Route {
  type: 'home' | 'exhibition';
  exhibitionId?: string;
  configUrl?: string;
}

export class Router {
  private onChange: ((route: Route) => void) | null = null;

  constructor() {
    window.addEventListener('hashchange', () => {
      this.onChange?.(this.currentRoute());
    });
  }

  onRouteChange(cb: (route: Route) => void): void {
    this.onChange = cb;
  }

  currentRoute(): Route {
    const hash = window.location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query ?? '');

    if (path.startsWith('/exhibition/')) {
      const id = path.replace('/exhibition/', '');
      return {
        type: 'exhibition',
        exhibitionId: decodeURIComponent(id),
        configUrl: params.get('config') ?? undefined,
      };
    }

    return { type: 'home' };
  }

  navigateTo(exhibitionId: string): void {
    window.location.hash = `/exhibition/${encodeURIComponent(exhibitionId)}`;
  }

  navigateHome(): void {
    window.location.hash = '/';
  }
}
