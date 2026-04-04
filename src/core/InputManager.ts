export class InputManager {
  readonly keys: Set<string> = new Set();
  private onClickCallbacks: ((e: MouseEvent) => void)[] = [];

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('click', this.handleClick);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleClick = (e: MouseEvent): void => {
    for (const cb of this.onClickCallbacks) {
      cb(e);
    }
  };

  onClick(cb: (e: MouseEvent) => void): void {
    this.onClickCallbacks.push(cb);
  }

  isPressed(code: string): boolean {
    return this.keys.has(code);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('click', this.handleClick);
  }
}
