export const VIEW_META = {
  newtab: { label: 'New Tab', icon: 'star' },
  site: { label: 'Site', icon: 'site' },
  chat: { label: 'Notes', icon: 'chat' },
  assistant: { label: 'AI', icon: 'sparkle' },
  games: { label: 'Games', icon: 'games' },
  account: { label: 'Account', icon: 'account' },
  settings: { label: 'Settings', icon: 'settings' }
};

let tabIdSeq = 1;

export const state = {
  tabs: [{ id: tabIdSeq, view: 'newtab' }],
  activeTabId: tabIdSeq,
  historyStack: ['newtab'],
  historyIndex: 0,

  pinned: JSON.parse(localStorage.getItem('ember-pinned') || 'null') || [
    { label: 'Music', url: 'https://music.youtube.com' },
    { label: 'Video', url: 'https://vimeo.com' }
  ],
  notes: JSON.parse(localStorage.getItem('ember-notes') || '[]'),
  account: JSON.parse(localStorage.getItem('ember-account') || 'null') || { name: 'Guest', color: '#F2A65A' },
  settings: (() => {
    const defaults = {
      autoCollapse: false,
      apiHost: 'Auto',
      proxyUrl: 'https://invisiproxy.com/scramjet/',
      blockAds: true,
      searchEngine: 'DuckDuckGo',
      background: 'DarkVeil',
      accent: 'amber',
      tabDisguise: 'None',
      tabTitle: '',
      faviconUrl: '',
      exitKey: '',
      exitUrl: 'https://docs.google.com/document/u/0/',
      confirmBeforeLeaving: false,
      autoCoverTab: false
    };
    const saved = JSON.parse(localStorage.getItem('ember-settings') || 'null');
    return { ...defaults, ...(saved || {}) };
  })(),
  favorites: new Set(JSON.parse(localStorage.getItem('ember-favorites') || '[]')),
  gameSearch: '',
  showFavOnly: false,
  aiMessages: []
};

export function nextTabId() {
  tabIdSeq++;
  return tabIdSeq;
}

export function activeTab() {
  return state.tabs.find((t) => t.id === state.activeTabId);
}

export function persist() {
  localStorage.setItem('ember-pinned', JSON.stringify(state.pinned));
  localStorage.setItem('ember-notes', JSON.stringify(state.notes));
  localStorage.setItem('ember-account', JSON.stringify(state.account));
  localStorage.setItem('ember-settings', JSON.stringify(state.settings));
  localStorage.setItem('ember-favorites', JSON.stringify([...state.favorites]));
}
