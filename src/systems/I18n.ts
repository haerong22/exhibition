// Lightweight i18n: registry + DOM auto-bind via data-i18n attributes.
// Translations live in messages below. Keys are dotted (section.thing).
// Use `{var}` placeholders and pass an object to `t()` to interpolate.

const STORAGE_KEY = 'gallery-locale';

export type Locale = 'ko' | 'en';

type Messages = Record<string, string>;

const ko: Messages = {
  // Picker
  'picker.title': '전시 선택',
  'picker.tab.builtin': '기본 템플릿',
  'picker.tab.custom': '내 템플릿',
  'picker.tab.exhibitions': '내 전시회',
  'picker.search.placeholder': '이름으로 검색...',
  'picker.sort.updated': '최근 수정 순',
  'picker.sort.created': '최신 생성 순',
  'picker.sort.name': '이름 순',
  'picker.btn.import': '가져오기',
  'picker.btn.newTemplate': '새 템플릿 만들기',
  'picker.btn.newExhibition': '새 전시회 만들기',
  'picker.empty.loading': '불러오는 중...',
  'picker.empty.noTemplates': '템플릿이 없습니다',
  'picker.empty.noCustomTemplates': '저장된 템플릿이 없습니다. 에디터에서 맵을 만들고 템플릿으로 저장하세요.',
  'picker.empty.noExhibitions': '저장된 전시회가 없습니다. 템플릿을 선택하여 전시회를 만들어보세요.',
  'picker.empty.noResults': '검색 결과가 없습니다.',
  // Card buttons
  'card.btn.copyLink': '링크 복사',
  'card.btn.copied': '복사됨',
  'card.btn.qr': 'QR',
  'card.btn.edit': '편집',
  'card.btn.editMap': '맵 편집',
  'card.btn.export': '내보내기',
  'card.btn.delete': '삭제',
  'card.meta.artworkCount': '작품 {n}개',
  'card.meta.favorites': '★ {n}',
  'card.meta.customTemplate': '커스텀 템플릿',
  'card.meta.recommended': '추천 {label}',
  // QR
  'qr.hint': '스마트폰 카메라로 스캔하여 접속',
  // Loading screen
  'loading.title': 'EXHIBITION',
  'loading.preparing': '준비 중...',
  'loading.ready': '준비 완료',
  'loading.enter': '입장하기',
  'loading.stage.spaceStructure': '공간 구조 생성 중...',
  'loading.stage.texturesArtworks': '텍스처 및 작품 로딩 중...',
  'loading.stage.composing': '씬 구성 중...',
  'loading.stage.fetchingInfo': '전시 정보 불러오는 중...',
  'loading.progress.textures': '작품 텍스처 로딩 {loaded} / {total}',
  'loading.error.notFound': '전시를 불러올 수 없습니다: {id}',
  'loading.error.noMapData': '맵 데이터가 없습니다. 에디터에서 미리보기를 눌러주세요.',
  'loading.error.mapNotFound': '맵을 찾을 수 없습니다: {id}',
  'loading.error.title': '오류',
  'loading.title.editorPreview': '에디터 미리보기',
  // HUD
  'hud.desktop': 'WASD 이동 · 마우스 시선 · 클릭 작품 감상 · T 투어 · M 음소거 · P 스크린샷 · ? 도움말 · ESC 나가기',
  'hud.mobile': '조이스틱 이동 · 터치 시선 · 탭 작품 감상',
  // Tour
  'tour.start': '▶ 자동 투어 (T)',
  'tour.startFavorites': '★ 즐겨찾기 투어',
  'tour.stop': '투어 종료',
  'tour.progress': '투어 {current} / {total}',
  'tour.progress.favorites': '★ 투어 {current} / {total}',
  // Buttons
  'btn.sound.title': '사운드 켜기/끄기 (M)',
  'btn.lang.title': '언어 변경',
  'btn.theme.title': '테마 전환 (라이트/다크)',
  'btn.screenshot.title': '스크린샷 (P)',
  // Shortcut help overlay
  'help.title': '컨트롤 안내',
  'help.move': '이동',
  'help.look': '시선 이동',
  'help.view': '작품 감상',
  'help.tour': '자동 투어',
  'help.mute': '사운드 토글',
  'help.screenshot': '스크린샷',
  'help.favorite': '즐겨찾기 토글 (작품 감상 중)',
  'help.close': '작품 닫기',
  'help.thisHelp': '이 도움말',
  // Artwork info panel
  'panel.detail.loading': '상세 정보 불러오는 중...',
  'panel.detail.error': '상세 정보를 불러올 수 없습니다',
  'panel.stats': '조회 {views} · 좋아요 {likes}',
  'panel.link': 'Grafolio에서 보기 →',
  'panel.nav.prev': '이전 작품',
  'panel.nav.next': '다음 작품',
  'panel.fav.add': '즐겨찾기 (F)',
  'panel.fav.remove': '즐겨찾기 해제 (F)',
  'zoom.hint': '스크롤 확대 · 드래그 이동 · 더블클릭 초기화 · ESC 닫기',
  // Exhibition credits
  'credit.artist': '작가: {name}',
  'credit.curator': '큐레이터: {name}',
  // Exhibition info modal (editor save flow)
  'editor.info.title': '전시 정보 (선택)',
  'editor.info.description': '큐레이터 노트 / 인트로 설명',
  'editor.info.descriptionPlaceholder': '큐레이터 노트, 작가 소개, 전시 의도 등을 자유롭게 작성하세요.',
  'editor.info.artist': '작가',
  'editor.info.artistPlaceholder': '예: 김작가',
  'editor.info.curator': '큐레이터',
  'editor.info.curatorPlaceholder': '예: 김큐레이터',
  'editor.info.hint': '관람객이 입장 전 보게 될 정보입니다.',
  'editor.info.skip': '건너뛰기',
  'editor.info.confirm': '확인',
  // Controls strip on loading screen (kbd labels)
  'controls.desktop.move': '이동',
  'controls.desktop.look': '시선',
  'controls.desktop.view': '감상',
  'controls.desktop.tour': '투어',
  'controls.desktop.mute': '음소거',
  'controls.desktop.close': '닫기',
  'controls.mobile.move': '이동',
  'controls.mobile.look': '시선',
  'controls.mobile.view': '감상',
  // Import dialog result
  'import.success': '{n}개 가져왔습니다.',
  'import.rejected': '(검증 실패 {n}개)',
  // Delete confirms
  'confirm.deleteExhibition': '"{name}" 전시회를 삭제할까요?',
  'confirm.deleteTemplate': '"{name}" 템플릿을 삭제할까요?',

  // Editor
  'editor.title': 'Gallery Map Editor',
  'editor.mode.map': '맵 편집 모드',
  'editor.mode.exhibition': '전시 모드',
  'editor.label.newExhibition': '새 전시회',
  'editor.label.editing': '편집 중: {name}',
  'editor.btn.new': '새로 만들기',
  'editor.btn.myMaps': '내 전시회',
  'editor.btn.save': '저장',
  'editor.btn.export': 'JSON 내보내기',
  'editor.btn.preview': '3D 미리보기',
  'editor.btn.help': '단축키',
  'editor.section.tools': '도구',
  'editor.section.moodboard': '무드보드',
  'editor.section.mapSize': '맵 크기',
  'editor.section.wallHeight': '벽 높이 (m)',
  'editor.section.textures': '텍스처',
  'editor.tool.floor': '바닥',
  'editor.tool.wall': '벽',
  'editor.tool.door': '문',
  'editor.tool.artwork': '작품',
  'editor.tool.spawn': '시작점',
  'editor.tool.bench': '벤치',
  'editor.tool.pillar': '기둥',
  'editor.tool.pedestal': '좌대',
  'editor.tool.model': '3D모델',
  'editor.tool.empty': '지우기',
  'editor.moodboard.placeholder': '무드보드 ID',
  'editor.moodboard.load': '불러오기',
  'editor.moodboard.loading': '불러오는 중...',
  'editor.moodboard.notFound': '무드보드를 찾을 수 없습니다',
  'editor.moodboard.loaded': '{n}개 작품 로드 완료',
  'editor.moodboard.autoExhibit': '자동 전시',
  'editor.artwork.library': '작품 라이브러리',
  'editor.artwork.search': '제목/작가 검색...',
  'editor.artwork.empty.noMoodboard': '무드보드를 먼저 불러오세요',
  'editor.artwork.empty.noResults': '검색 결과가 없습니다',
  'editor.artwork.facing': '방향',
  'editor.artwork.facing.auto': '자동 감지',
  'editor.artwork.facing.north': '북 (위)',
  'editor.artwork.facing.south': '남 (아래)',
  'editor.artwork.facing.east': '동 (오른쪽)',
  'editor.artwork.facing.west': '서 (왼쪽)',
  'editor.artwork.manualId': 'ID로 직접 입력',
  'editor.artwork.manualId.placeholder': '작품 ID',
  'editor.artwork.hint': '선택 후 클릭 또는 카드를 드래그하여 배치',
  'editor.size.resize': '크기 변경',
  'editor.shortcut.title': '단축키',
};

const en: Messages = {
  'picker.title': 'Select Exhibition',
  'picker.tab.builtin': 'Templates',
  'picker.tab.custom': 'My Templates',
  'picker.tab.exhibitions': 'My Exhibitions',
  'picker.search.placeholder': 'Search by name...',
  'picker.sort.updated': 'Recently updated',
  'picker.sort.created': 'Recently created',
  'picker.sort.name': 'Name',
  'picker.btn.import': 'Import',
  'picker.btn.newTemplate': 'New template',
  'picker.btn.newExhibition': 'New exhibition',
  'picker.empty.loading': 'Loading...',
  'picker.empty.noTemplates': 'No templates',
  'picker.empty.noCustomTemplates': 'No saved templates. Create a map in the editor and save as a template.',
  'picker.empty.noExhibitions': 'No saved exhibitions. Pick a template to create one.',
  'picker.empty.noResults': 'No results.',
  'card.btn.copyLink': 'Copy link',
  'card.btn.copied': 'Copied',
  'card.btn.qr': 'QR',
  'card.btn.edit': 'Edit',
  'card.btn.editMap': 'Edit map',
  'card.btn.export': 'Export',
  'card.btn.delete': 'Delete',
  'card.meta.artworkCount': '{n} artworks',
  'card.meta.favorites': '★ {n}',
  'card.meta.customTemplate': 'Custom template',
  'card.meta.recommended': 'Recommended {label}',
  'qr.hint': 'Scan with your phone camera',
  'loading.title': 'EXHIBITION',
  'loading.preparing': 'Preparing...',
  'loading.ready': 'Ready',
  'loading.enter': 'Enter',
  'loading.stage.spaceStructure': 'Building space...',
  'loading.stage.texturesArtworks': 'Loading textures & artworks...',
  'loading.stage.composing': 'Composing scene...',
  'loading.stage.fetchingInfo': 'Fetching exhibition info...',
  'loading.progress.textures': 'Artwork textures {loaded} / {total}',
  'loading.error.notFound': 'Cannot load exhibition: {id}',
  'loading.error.noMapData': 'No map data. Open from the editor preview button.',
  'loading.error.mapNotFound': 'Map not found: {id}',
  'loading.error.title': 'Error',
  'loading.title.editorPreview': 'Editor preview',
  'hud.desktop': 'WASD move · Mouse look · Click to view · T tour · M mute · P screenshot · ? help · ESC exit',
  'hud.mobile': 'Joystick move · Touch look · Tap to view',
  'tour.start': '▶ Auto tour (T)',
  'tour.startFavorites': '★ Favorites tour',
  'tour.stop': 'Stop tour',
  'tour.progress': 'Tour {current} / {total}',
  'tour.progress.favorites': '★ Tour {current} / {total}',
  'btn.sound.title': 'Toggle sound (M)',
  'btn.lang.title': 'Change language',
  'btn.theme.title': 'Toggle theme (light/dark)',
  'btn.screenshot.title': 'Screenshot (P)',
  'help.title': 'Controls',
  'help.move': 'Move',
  'help.look': 'Look',
  'help.view': 'View artwork',
  'help.tour': 'Auto tour',
  'help.mute': 'Toggle sound',
  'help.screenshot': 'Screenshot',
  'help.favorite': 'Toggle favorite (while viewing)',
  'help.close': 'Close artwork',
  'help.thisHelp': 'This help',
  'panel.detail.loading': 'Loading details...',
  'panel.detail.error': 'Cannot load details',
  'panel.stats': '{views} views · {likes} likes',
  'panel.link': 'View on Grafolio →',
  'panel.nav.prev': 'Previous',
  'panel.nav.next': 'Next',
  'panel.fav.add': 'Favorite (F)',
  'panel.fav.remove': 'Unfavorite (F)',
  'zoom.hint': 'Scroll to zoom · Drag to pan · Double-click to reset · ESC to close',
  'credit.artist': 'Artist: {name}',
  'credit.curator': 'Curator: {name}',
  'editor.info.title': 'Exhibition info (optional)',
  'editor.info.description': 'Curator note / intro',
  'editor.info.descriptionPlaceholder': 'Write a curator note, artist bio, or exhibition intent.',
  'editor.info.artist': 'Artist',
  'editor.info.artistPlaceholder': 'e.g. Jane Doe',
  'editor.info.curator': 'Curator',
  'editor.info.curatorPlaceholder': 'e.g. Sam Smith',
  'editor.info.hint': 'Shown to visitors before they enter.',
  'editor.info.skip': 'Skip',
  'editor.info.confirm': 'Confirm',
  'controls.desktop.move': 'Move',
  'controls.desktop.look': 'Look',
  'controls.desktop.view': 'View',
  'controls.desktop.tour': 'Tour',
  'controls.desktop.mute': 'Mute',
  'controls.desktop.close': 'Close',
  'controls.mobile.move': 'Move',
  'controls.mobile.look': 'Look',
  'controls.mobile.view': 'View',
  'import.success': 'Imported {n}.',
  'import.rejected': '({n} invalid)',
  'confirm.deleteExhibition': 'Delete exhibition "{name}"?',
  'confirm.deleteTemplate': 'Delete template "{name}"?',

  // Editor
  'editor.title': 'Gallery Map Editor',
  'editor.mode.map': 'Map mode',
  'editor.mode.exhibition': 'Exhibition mode',
  'editor.label.newExhibition': 'New exhibition',
  'editor.label.editing': 'Editing: {name}',
  'editor.btn.new': 'New',
  'editor.btn.myMaps': 'My exhibitions',
  'editor.btn.save': 'Save',
  'editor.btn.export': 'Export JSON',
  'editor.btn.preview': '3D preview',
  'editor.btn.help': 'Shortcuts',
  'editor.section.tools': 'Tools',
  'editor.section.moodboard': 'Moodboard',
  'editor.section.mapSize': 'Map size',
  'editor.section.wallHeight': 'Wall height (m)',
  'editor.section.textures': 'Textures',
  'editor.tool.floor': 'Floor',
  'editor.tool.wall': 'Wall',
  'editor.tool.door': 'Door',
  'editor.tool.artwork': 'Artwork',
  'editor.tool.spawn': 'Spawn',
  'editor.tool.bench': 'Bench',
  'editor.tool.pillar': 'Pillar',
  'editor.tool.pedestal': 'Pedestal',
  'editor.tool.model': '3D model',
  'editor.tool.empty': 'Erase',
  'editor.moodboard.placeholder': 'Moodboard ID',
  'editor.moodboard.load': 'Load',
  'editor.moodboard.loading': 'Loading...',
  'editor.moodboard.notFound': 'Moodboard not found',
  'editor.moodboard.loaded': '{n} artworks loaded',
  'editor.moodboard.autoExhibit': 'Auto exhibit',
  'editor.artwork.library': 'Artwork library',
  'editor.artwork.search': 'Search title/artist...',
  'editor.artwork.empty.noMoodboard': 'Load a moodboard first',
  'editor.artwork.empty.noResults': 'No results',
  'editor.artwork.facing': 'Facing',
  'editor.artwork.facing.auto': 'Auto detect',
  'editor.artwork.facing.north': 'North (up)',
  'editor.artwork.facing.south': 'South (down)',
  'editor.artwork.facing.east': 'East (right)',
  'editor.artwork.facing.west': 'West (left)',
  'editor.artwork.manualId': 'Enter ID directly',
  'editor.artwork.manualId.placeholder': 'Artwork ID',
  'editor.artwork.hint': 'Select & click, or drag a card to place',
  'editor.size.resize': 'Resize',
  'editor.shortcut.title': 'Shortcuts',
};

const messages: Record<Locale, Messages> = { ko, en };

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

class I18nImpl {
  private locale: Locale;
  private listeners: Array<(l: Locale) => void> = [];

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ko' || stored === 'en') {
      this.locale = stored;
    } else {
      this.locale = navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
    }
  }

  get current(): Locale { return this.locale; }

  setLocale(l: Locale): void {
    if (this.locale === l) return;
    this.locale = l;
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* private mode */ }
    document.documentElement.lang = l;
    this.applyToDom();
    for (const cb of this.listeners) cb(l);
  }

  toggle(): void {
    this.setLocale(this.locale === 'ko' ? 'en' : 'ko');
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const template = messages[this.locale][key] ?? messages.en[key] ?? key;
    return interpolate(template, vars);
  }

  onChange(cb: (locale: Locale) => void): void {
    this.listeners.push(cb);
  }

  // Pick the locale-preferred field. Currently: ko → *Ko (fallback to base), en → base (fallback to *Ko)
  pick(base: string | undefined, ko: string | undefined): string {
    if (this.locale === 'ko') return (ko && ko.trim()) ? ko : (base ?? '');
    return (base && base.trim()) ? base : (ko ?? '');
  }

  // Apply translations to all elements with data-i18n / data-i18n-placeholder / data-i18n-title
  applyToDom(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n!;
      el.textContent = this.t(key);
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder!;
      (el as HTMLInputElement).placeholder = this.t(key);
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
      const key = el.dataset.i18nTitle!;
      el.title = this.t(key);
    });
  }
}

export const I18n = new I18nImpl();
