import './style.css';
import { svg } from './icons.js';
import { state, activeTab, nextTabId, persist, VIEW_META } from './state.js';
import GAMES from './games-list.json';
import { AI_SUGGESTIONS, AI_LIMIT, getReply, getUsage, bumpUsage, checkHealth, getHealth } from './ai.js';
import {
  sanitizeGameHtml as sanitizeGameHtmlCentral,
  makeSafeBlockedFallbackHtml as makeSafeBlockedFallbackHtmlCentral
} from './ad-blocker.js';

/* ---------------- navigation ---------------- */
function navigate(view, push = true) {
  activeTab().view = view;
  if (push) {
    state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
    state.historyStack.push(view);
    state.historyIndex++;
  }
  renderAll();
}
function goBack() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    activeTab().view = state.historyStack[state.historyIndex];
    renderAll();
  }
}
function goForward() {
  if (state.historyIndex < state.historyStack.length - 1) {
    state.historyIndex++;
    activeTab().view = state.historyStack[state.historyIndex];
    renderAll();
  }
}
function reload() {
  document.getElementById('reloadBtn').classList.add('spinning');
  setTimeout(() => document.getElementById('reloadBtn').classList.remove('spinning'), 500);
  renderPanel();
}

/* ---------------- chrome ---------------- */
document.getElementById('backBtn').onclick = goBack;
document.getElementById('fwdBtn').onclick = goForward;
document.getElementById('reloadBtn').onclick = reload;
document.getElementById('collapseBtn').onclick = () => document.getElementById('sidebar').classList.toggle('collapsed');
document.getElementById('newTabBtn').onclick = () => {
  const id = nextTabId();
  state.tabs.push({ id, view: 'newtab' });
  state.activeTabId = id;
  state.historyStack = ['newtab'];
  state.historyIndex = 0;
  renderAll();
};

function normalizeSiteUrl(raw) {
  const val = raw.trim();
  if (!val) return null;

  if (/^https?:\/\//i.test(val)) return val;

  const siteHints = {
    youtube: 'https://youtube.com',
    gmail: 'https://gmail.com',
    google: 'https://google.com',
    github: 'https://github.com',
    twitter: 'https://x.com',
    x: 'https://x.com',
    reddit: 'https://reddit.com',
    netflix: 'https://netflix.com',
    docs: 'https://docs.google.com',
    drive: 'https://drive.google.com'
  };

  const lower = val.toLowerCase();
  if (siteHints[lower]) return siteHints[lower];

  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(val)) return 'https://' + val;

  const engine = state.settings.searchEngine === 'DuckDuckGo' ? 'https://duckduckgo.com/?q=' : state.settings.searchEngine === 'Brave' ? 'https://search.brave.com/search?q=' : 'https://www.google.com/search?q=';
  return `${engine}${encodeURIComponent(val)}`;
}

function proxiedUrl(rawUrl) {
  const proxyUrl = state.settings.proxyUrl && state.settings.proxyUrl.trim();
  if (!proxyUrl || !/^https?:\/\//i.test(rawUrl)) return rawUrl;

  if (proxyUrl.includes('?url=') || proxyUrl.includes('?target=') || proxyUrl.includes('?u=')) {
    return `${proxyUrl}${encodeURIComponent(rawUrl)}`;
  }

  const base = proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`;
  return `${base}${rawUrl.replace(/^https?:\/\//i, '')}`;
}

function proxyRequiresExternalTab(proxyUrl) {
  if (!proxyUrl) return false;
  try {
    return /invisiproxy\.com/i.test(new URL(proxyUrl).hostname);
  } catch {
    return /invisiproxy\.com/i.test(proxyUrl);
  }
}

function deriveTabMetaFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./i, '');
    const title = host || 'Site';
    const favicon = `${url.origin}/favicon.ico`;
    return { title, favicon };
  } catch {
    return { title: 'Site', favicon: '' };
  }
}

function openExternal(raw) {
  const url = normalizeSiteUrl(raw);
  if (!url) return;

  if (proxyRequiresExternalTab(state.settings.proxyUrl)) {
    window.open(state.settings.proxyUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const proxied = proxiedUrl(url);
  const tab = activeTab();
  tab.view = 'site';
  tab.siteUrl = proxied;
  const meta = deriveTabMetaFromUrl(url);
  tab.title = meta.title;
  tab.favicon = meta.favicon;
  tab.icon = 'site';

  state.historyStack = ['site'];
  state.historyIndex = 0;

  renderAll();
}
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    openExternal(e.target.value);
    e.target.value = '';
  }
});

/* ---------------- sidebar: tabs + pinned + bottom nav ---------------- */
function renderTabs() {
  const list = document.getElementById('tabList');
  list.innerHTML = '';
  state.tabs.forEach((t) => {
    const meta = VIEW_META[t.view];
    const row = document.createElement('button');
    row.className = 'tab-item' + (t.id === state.activeTabId ? ' active' : '');
    const label = t.title || meta.label;
    const favicon = t.favicon && t.favicon.trim() ? `<img class="tab-favicon" src="${t.favicon}" alt="">` : svg(meta.icon);
    row.innerHTML = `${favicon}<span class="tlabel">${label}</span><span class="tclose" title="Close tab">✕</span>`;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.tclose')) {
        if (state.tabs.length > 1) {
          state.tabs = state.tabs.filter((x) => x.id !== t.id);
          if (state.activeTabId === t.id) state.activeTabId = state.tabs[state.tabs.length - 1].id;
        } else {
          t.view = 'newtab';
          state.historyStack = ['newtab'];
          state.historyIndex = 0;
        }
        renderAll();
        return;
      }
      state.activeTabId = t.id;
      state.historyStack = [t.view];
      state.historyIndex = 0;
      renderAll();
    });
    list.appendChild(row);
  });
}

function renderPinned() {
  const row = document.getElementById('pinnedRow');
  row.innerHTML = '';
  state.pinned.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'pinned site';
    el.title = p.label;
    el.innerHTML = svg('site') + `<span class="unpin">✕</span>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.unpin')) {
        state.pinned.splice(i, 1);
        persist();
        renderPinned();
        return;
      }
      window.open(p.url, '_blank');
    });
    row.appendChild(el);
  });
  const add = document.createElement('div');
  add.className = 'pinned add';
  add.title = 'Add pinned site';
  add.innerHTML = svg('plus');
  add.onclick = () => {
    const label = prompt('Name this shortcut:');
    if (!label) return;
    let url = prompt('URL:', 'https://');
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    state.pinned.push({ label, url });
    persist();
    renderPinned();
  };
  row.appendChild(add);
}

function renderBottomNav() {
  const nav = document.getElementById('bottomNav');
  const items = [
    ['chat', 'Notes'],
    ['assistant', 'AI'],
    ['games', 'Games'],
    ['account', 'Account'],
    ['settings', 'Settings']
  ];
  nav.innerHTML = '';
  items.forEach(([view, label]) => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (activeTab().view === view ? ' active' : '');
    btn.innerHTML = svg(VIEW_META[view].icon) + `<span>${label}</span>`;
    btn.onclick = () => navigate(view);
    nav.appendChild(btn);
  });
}

function updateChrome() {
  document.getElementById('backBtn').disabled = state.historyIndex === 0;
  document.getElementById('fwdBtn').disabled = state.historyIndex >= state.historyStack.length - 1;
  document.getElementById('urlInput').placeholder = activeTab().view === 'newtab' ? 'Search or enter URL' : 'ember://' + activeTab().view;
}

/* ---------------- panels ---------------- */
function renderPanel() {
  const panel = document.getElementById('panel');
  panel.classList.remove('wide');
  panel.classList.remove('site-mode');
  const view = activeTab().view;

  if (view === 'newtab') return renderNewTab(panel);
  if (view === 'site') {
    panel.classList.add('site-mode');
    return renderSitePanel(panel);
  }
  if (view === 'chat') return renderNotes(panel);
  if (view === 'games') {
    panel.classList.add('wide');
    return renderGamesPanel(panel);
  }
  if (view === 'assistant') return renderAiPanel(panel);
  if (view === 'account') return renderAccount(panel);
  if (view === 'settings') return renderSettings(panel);
}

function renderSitePanel(panel) {
  const tab = activeTab();
  const src = tab.siteUrl || 'https://example.com';
  panel.innerHTML = `
    <div class="site-view fade-in">
      <iframe class="site-frame" title="${tab.title || 'Site'}"></iframe>
    </div>`;

  const frame = panel.querySelector('.site-frame');
  if (!state.settings.blockAds) {
    frame.src = src;
    return;
  }

  loadSiteFrame(frame, src);
}

function renderNewTab(panel) {
  panel.innerHTML = `
    <div class="content fade-in">
      <div class="wordmark">ember</div>
      <div class="omnibox">${svg('search')}<input id="omniInput" type="text" placeholder="Search or ask anything"></div>
      <div class="clock" id="clockLine"></div>
    </div>`;
  panel.querySelector('#omniInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      openExternal(e.target.value);
      e.target.value = '';
    }
  });
  tickClock();
}

let clockTimer = null;
function tickClock() {
  clearInterval(clockTimer);
  const el = document.getElementById('clockLine');
  const paint = () => {
    if (!document.getElementById('clockLine')) {
      clearInterval(clockTimer);
      return;
    }
    const now = new Date();
    el.textContent =
      now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) +
      ' · ' +
      now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  paint();
  clockTimer = setInterval(paint, 1000 * 15);
}

function renderNotes(panel) {
  panel.innerHTML = `
    <div class="card fade-in">
      <h2>Notes</h2>
      <div class="sub">A scratchpad for this tab — saved on this device.</div>
      <div class="note-form">
        <input id="noteInput" type="text" placeholder="Jot something down and hit enter">
        <button id="noteAdd">Add</button>
      </div>
      <ul class="note-list" id="noteList"></ul>
    </div>`;
  const renderNoteList = () => {
    const list = panel.querySelector('#noteList');
    list.innerHTML = state.notes.length ? '' : '<div class="empty">No notes yet.</div>';
    state.notes.forEach((n, i) => {
      const li = document.createElement('li');
      li.className = 'note-enter';
      li.innerHTML = `<span>${n}</span><button class="rm">Remove</button>`;
      li.querySelector('.rm').onclick = () => {
        li.classList.add('note-exit');
        setTimeout(() => {
          state.notes.splice(i, 1);
          persist();
          renderNoteList();
        }, 160);
      };
      list.appendChild(li);
    });
  };
  const addNote = () => {
    const input = panel.querySelector('#noteInput');
    if (!input.value.trim()) return;
    state.notes.push(input.value.trim());
    input.value = '';
    persist();
    renderNoteList();
  };
  panel.querySelector('#noteAdd').onclick = addNote;
  panel.querySelector('#noteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNote();
  });
  renderNoteList();
}

function renderAccount(panel) {
  const colors = ['#F2A65A', '#E15A7A', '#5B3A73', '#3FD68C', '#5AA9E1'];
  panel.innerHTML = `
    <div class="card fade-in">
      <div class="avatar" id="avatarPreview" style="background:${state.account.color}">${(state.account.name || 'G').slice(0, 1).toUpperCase()}</div>
      <h2>Account</h2>
      <div class="sub">Stored locally on this device — nothing is sent anywhere.</div>
      <div class="field">
        <label>Display name</label>
        <input type="text" id="nameInput" value="${state.account.name.replace(/"/g, '&quot;')}">
      </div>
      <div class="field">
        <label>Color</label>
        <div class="swatches" id="swatches"></div>
      </div>
      <button class="primary-btn" id="saveAccount">Save</button>
    </div>`;
  const sw = panel.querySelector('#swatches');
  colors.forEach((c) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (c === state.account.color ? ' selected' : '');
    s.style.background = c;
    s.onclick = () => {
      state.account.color = c;
      renderPanel();
    };
    sw.appendChild(s);
  });
  panel.querySelector('#saveAccount').onclick = () => {
    state.account.name = panel.querySelector('#nameInput').value.trim() || 'Guest';
    persist();
    renderPanel();
  };
}

let exitKeyCaptureActive = false;

function renderSettings(panel) {
  const health = getHealth();
  const accentOptions = [
    { value: 'amber', color: '#F2A65A' },
    { value: 'lavender', color: '#8B7CFF' },
    { value: 'blue', color: '#5AA9E1' },
    { value: 'green', color: '#3FD68C' },
    { value: 'rose', color: '#E15A7A' }
  ];

  panel.innerHTML = `
    <div class="card fade-in settings-card">
      <div class="settings-section settings-header">
        <div class="settings-section-label">Settings</div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Backend</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">API host</div>
            <div class="setting-help">Using ${health.connected ? (health.provider || 'the local proxy') : 'the local proxy'}.</div>
          </div>
          <select class="settings-select" id="apiHostSelect">
            <option value="Auto" ${state.settings.apiHost === 'Auto' ? 'selected' : ''}>Auto</option>
            <option value="Local" ${state.settings.apiHost === 'Local' ? 'selected' : ''}>Local</option>
            <option value="Custom" ${state.settings.apiHost === 'Custom' ? 'selected' : ''}>Custom</option>
          </select>
        </div>
        <div class="settings-row settings-row-stack">
          <div class="setting-copy">
            <div class="setting-label">Proxy URL</div>
            <div class="setting-help">Use a public proxy for pages that are blocked. Some proxies, like InvisiProxy, only work when opened in a separate tab.</div>
          </div>
          <input class="settings-input" id="proxyUrlInput" type="text" value="${state.settings.proxyUrl}" placeholder="https://r.jina.ai/http://">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Browsing</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Block ads on proxied sites</div>
            <div class="setting-help">Blocks known advertising resources and overlays in supported games.</div>
          </div>
          <button type="button" class="switch ${state.settings.blockAds ? 'on' : ''}" data-toggle="blockAds" aria-label="Toggle block ads"></button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Search</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Search engine</div>
          </div>
          <select class="settings-select" id="searchEngineSelect">
            <option value="DuckDuckGo" ${state.settings.searchEngine === 'DuckDuckGo' ? 'selected' : ''}>DuckDuckGo</option>
            <option value="Google" ${state.settings.searchEngine === 'Google' ? 'selected' : ''}>Google</option>
            <option value="Brave" ${state.settings.searchEngine === 'Brave' ? 'selected' : ''}>Brave</option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Appearance</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Background</div>
            <div class="setting-help">Choose the animated veil for the new-tab view.</div>
          </div>
          <select class="settings-select" id="backgroundSelect">
            <option value="DarkVeil" ${state.settings.background === 'DarkVeil' ? 'selected' : ''}>DarkVeil</option>
            <option value="Aurora" ${state.settings.background === 'Aurora' ? 'selected' : ''}>Aurora</option>
            <option value="Midnight" ${state.settings.background === 'Midnight' ? 'selected' : ''}>Midnight</option>
          </select>
        </div>
        <div class="settings-row settings-row-stack">
          <div class="setting-copy">
            <div class="setting-label">Accent color</div>
            <div class="setting-help">Tints the workmark, borders, and focus rings.</div>
          </div>
          <div class="swatches" id="accentSwatches">
            ${accentOptions
              .map(
                (option) => `
                  <button
                    type="button"
                    class="swatch ${state.settings.accent === option.value ? 'selected' : ''}"
                    data-accent="${option.value}"
                    title="${option.value}"
                    style="background:${option.color};"
                    aria-label="Select ${option.value} accent"
                  ></button>
                `
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Tab cover</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Tab disguise</div>
          </div>
          <select class="settings-select" id="tabDisguiseSelect">
            <option value="None" ${state.settings.tabDisguise === 'None' ? 'selected' : ''}>None</option>
            <option value="Incognito" ${state.settings.tabDisguise === 'Incognito' ? 'selected' : ''}>Incognito</option>
            <option value="Minimal" ${state.settings.tabDisguise === 'Minimal' ? 'selected' : ''}>Minimal</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Tab title</div>
          </div>
          <input class="settings-input" id="tabTitleInput" type="text" value="${state.settings.tabTitle}" placeholder="Lucide">
        </div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Favicon URL</div>
          </div>
          <input class="settings-input" id="faviconInput" type="text" value="${state.settings.faviconUrl}" placeholder="https://example.com/favicon.ico">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Quick exit</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Exit key</div>
            <div class="setting-help">Press this key anywhere to instantly bail to the exit URL.</div>
          </div>
          <div class="settings-inline">
            <input class="settings-input short" id="exitKeyInput" type="text" value="${state.settings.exitKey}" placeholder="Set key">
            <button type="button" class="settings-button" id="setExitKey">Set key</button>
          </div>
        </div>
        <div class="settings-row settings-row-stack">
          <div class="setting-copy">
            <div class="setting-label">Exit URL</div>
          </div>
          <div class="settings-inline full">
            <input class="settings-input" id="exitUrlInput" type="text" value="${state.settings.exitUrl}" placeholder="https://example.com">
            <button type="button" class="settings-button" id="saveExitUrl">Save</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Confirm before leaving</div>
            <div class="setting-help">Prompt when closing or navigating away.</div>
          </div>
          <button type="button" class="switch ${state.settings.confirmBeforeLeaving ? 'on' : ''}" data-toggle="confirmBeforeLeaving" aria-label="Toggle confirm before leaving"></button>
        </div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Auto cover tab</div>
            <div class="setting-help">On your next interaction, move the browser to the cover tab.</div>
          </div>
          <button type="button" class="switch ${state.settings.autoCoverTab ? 'on' : ''}" data-toggle="autoCoverTab" aria-label="Toggle auto cover tab"></button>
        </div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Open cover tab now</div>
          </div>
          <button type="button" class="settings-button secondary" id="openCoverTab">Open</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Data</div>
        <div class="settings-row">
          <div class="setting-copy">
            <div class="setting-label">Clear data</div>
            <div class="setting-help">Removes saved tabs, bookmarks, and settings.</div>
          </div>
          <button type="button" class="settings-button danger" id="resetAll">Clear</button>
        </div>
      </div>
    </div>`;

  panel.querySelectorAll('[data-toggle]').forEach((toggle) => {
    toggle.onclick = () => {
      const key = toggle.dataset.toggle;
      state.settings[key] = !state.settings[key];
      persist();
      renderSettings(panel);
    };
  });

  panel.querySelectorAll('select').forEach((select) => {
    select.onchange = () => {
      const id = select.id;
      if (id === 'apiHostSelect') state.settings.apiHost = select.value;
      if (id === 'searchEngineSelect') state.settings.searchEngine = select.value;
      if (id === 'backgroundSelect') state.settings.background = select.value;
      if (id === 'tabDisguiseSelect') state.settings.tabDisguise = select.value;
      persist();
    };
  });

  panel.querySelectorAll('.settings-input').forEach((input) => {
    input.oninput = () => {
      const id = input.id;
      if (id === 'tabTitleInput') state.settings.tabTitle = input.value;
      if (id === 'faviconInput') state.settings.faviconUrl = input.value;
      if (id === 'exitKeyInput') state.settings.exitKey = input.value;
      if (id === 'exitUrlInput') state.settings.exitUrl = input.value;
      if (id === 'proxyUrlInput') state.settings.proxyUrl = input.value;
      persist();
    };
  });

  panel.querySelector('#setExitKey').onclick = () => {
    exitKeyCaptureActive = true;
    panel.querySelector('#setExitKey').textContent = 'Press a key…';
  };

  panel.querySelector('#saveExitUrl').onclick = () => {
    state.settings.exitUrl = panel.querySelector('#exitUrlInput').value.trim() || 'https://example.com';
    persist();
  };

  panel.querySelector('#openCoverTab').onclick = () => {
    if (proxyRequiresExternalTab(state.settings.proxyUrl)) {
      window.open(state.settings.proxyUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const coverUrl = (state.settings.exitUrl || '').trim();
    const target = coverUrl || 'https://example.com';
    const currentTab = activeTab();
    currentTab.view = 'site';
    currentTab.siteUrl = proxiedUrl(normalizeSiteUrl(target) || target);
    const meta = deriveTabMetaFromUrl(normalizeSiteUrl(target) || target);
    currentTab.title = meta.title;
    currentTab.favicon = meta.favicon;
    currentTab.icon = 'site';
    renderAll();
  };

  panel.querySelector('#resetAll').onclick = () => {
    if (!confirm('Reset pinned shortcuts, notes, account and settings?')) return;
    state.pinned = [
      { label: 'Music', url: 'https://music.youtube.com' },
      { label: 'Video', url: 'https://vimeo.com' }
    ];
    state.notes = [];
    state.account = { name: 'Guest', color: '#F2A65A' };
    state.settings = {
      autoCollapse: false,
      apiHost: 'Auto',
      proxyUrl: 'https://r.jina.ai/http://',
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
    persist();
    renderAll();
  };

  panel.querySelectorAll('[data-accent]').forEach((swatch) => {
    swatch.onclick = () => {
      state.settings.accent = swatch.dataset.accent;
      persist();
      renderSettings(panel);
    };
  });
}

/* ---------------- games hub (loads the user's own local games) ---------------- */
function renderGamesPanel(panel) {
  panel.innerHTML = `
    <div class="games-wrap fade-in">
      <div class="games-toolbar">
        <div class="search-field">
          ${svg('search')}
          <input id="gameSearchInput" type="text" placeholder="Search games" value="${state.gameSearch.replace(/"/g, '&quot;')}">
        </div>
        <button class="tool-btn ${state.showFavOnly ? 'fav-on' : ''}" id="favToggleBtn">
          ${svg('starOutline')} Favorites <span class="count">${state.favorites.size}</span>
        </button>
        <button class="tool-btn" id="randomBtn">${svg('shuffle')} Random</button>
      </div>
      <div class="game-grid" id="gameGrid"></div>
    </div>`;

  panel.querySelector('#gameSearchInput').addEventListener('input', (e) => {
    state.gameSearch = e.target.value;
    paintGrid();
  });
  panel.querySelector('#favToggleBtn').onclick = () => {
    state.showFavOnly = !state.showFavOnly;
    renderGamesPanel(panel);
  };
  panel.querySelector('#randomBtn').onclick = () => {
    const visible = visibleGames();
    if (!visible.length) return;
    const pick = visible[Math.floor(Math.random() * visible.length)];
    const grid = panel.querySelector('#gameGrid');
    const tile = grid.querySelector(`[data-id="${pick.id}"]`);
    if (tile) {
      tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tile.classList.add('pulse');
      setTimeout(() => tile.classList.remove('pulse'), 900);
    }
  };

  function visibleGames() {
    const q = state.gameSearch.trim().toLowerCase();
    return GAMES.filter((g) => {
      if (state.showFavOnly && !state.favorites.has(g.id)) return false;
      if (q && !g.title.toLowerCase().includes(q) && !(g.genre || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function resolveGameThumbUrl(thumb) {
    if (!thumb) return '';
    return /^https?:\/\//i.test(thumb.trim()) ? thumb.trim() : `/games/${thumb.trim()}`;
  }

  function paintGrid() {
    const grid = panel.querySelector('#gameGrid');
    const list = visibleGames();
    if (!GAMES.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">No games yet</div>
          <div class="empty-state-sub">Drop your own HTML games into <code>public/games/</code> and list them in <code>src/games-list.json</code> — see ADDING-GAMES.md.</div>
        </div>`;
      return;
    }
    grid.innerHTML = list.length ? '' : '<div class="empty">No games match that search.</div>';
    list.forEach((g) => {
      const tile = document.createElement('div');
      tile.className = 'game-tile';
      tile.dataset.id = g.id;
      const isFav = state.favorites.has(g.id);
      const cover = g.thumb
        ? `<div class="cover" style="background-image:url('${resolveGameThumbUrl(g.thumb)}')"></div>`
        : `<div class="cover" style="background:linear-gradient(150deg, ${g.gradFrom || '#F2A65A'}, ${g.gradTo || '#E15A7A'})">${g.mono || g.title.slice(0, 2).toUpperCase()}</div>`;
      tile.innerHTML = `
        ${cover}
        <div class="genre">${g.genre || ''}</div>
        <button class="star ${isFav ? 'on' : ''}" title="Favorite">${svg(isFav ? 'star' : 'starOutline')}</button>
        <div class="title">${g.title}</div>`;
      tile.querySelector('.star').onclick = (e) => {
        e.stopPropagation();
        if (state.favorites.has(g.id)) state.favorites.delete(g.id);
        else state.favorites.add(g.id);
        persist();
        renderGamesPanel(panel);
      };
      tile.onclick = () => openGameModal(g);
      grid.appendChild(tile);
    });
  }
  paintGrid();
}

const MAX_SANITIZE_DEPTH = 3;

const AD_HTML_BLOCK_PATTERNS = [
  /doubleclick/i,
  /googlesyndication/i,
  /googletagservices/i,
  /googletagmanager/i,
  /googleadmanager/i,
  /imasdk\.googleapis/i,
  /s0\.2mdn\.net/i,
  /2mdn\.net/i,
  /googleadservices/i,
  /adservice\.google\.com/i,
  /gamemonetize\.com/i,
  /gamedistribution\.com/i,
  /adinplay\.com/i,
  /atmtd\.com/i,
  /liadm\.com/i,
  /pagead/i,
  /securepubads/i,
  /pubads_impl/i,
  /gpt\.js/i,
  /ima3\.js/i,
  /google_ads_iframe/i,
  /adsbygoogle/i,
  /new-ast\/viewflow/i,
  /vnolofur\/frameapp/i,
  /t4g-wrapper/i,
  /t4g-modal/i,
  /adslot/i,
  /googlesyndication/i,
  /googleads/i
];

const AD_BLOCKER_SHIM = `(function () {
  var AD_HOST_SUBSTRINGS = [
    'doubleclick.net',
    'securepubads.g.doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'pagead',
    'adsbygoogle',
    'googletagservices',
    'googletagmanager',
    'securepubads',
    'gpt.js',
    'pubads_impl.js',
    'imasdk.googleapis.com',
    'google_ads_iframe',
    'adslot',
    'ads-'
  ];

  function containsAdPattern(value) {
    if (!value) return false;
    var text = String(value).toLowerCase();
    for (var i = 0; i < AD_HOST_SUBSTRINGS.length; i++) {
      if (text.indexOf(AD_HOST_SUBSTRINGS[i]) !== -1) return true;
    }
    return false;
  }

  function getGlobalCssSelector(selector) {
    return document.querySelectorAll(selector);
  }

  function getComputedStyleSafe(el) {
    try {
      return window.getComputedStyle(el);
    } catch (e) {
      return null;
    }
  }

  function isOverlayLike(el) {
    var style = (el.getAttribute('style') || '').toLowerCase();
    var css = getComputedStyleSafe(el);
    var width = 0;
    var height = 0;
    try {
      width = parseFloat((css && css.width) || 0) || 0;
      height = parseFloat((css && css.height) || 0) || 0;
    } catch (e) {}

    if (!style && (!css || !css.position)) return false;

    var position = (css && css.position) || '';
    var zIndexText = (css && css.zIndex) || '';
    var zIndex = parseInt(zIndexText, 10);
    var coversMostViewport = (width > window.innerWidth * 0.35 && height > window.innerHeight * 0.35) ||
      (style.indexOf('position:fixed') !== -1 && style.indexOf('width:100%') !== -1 && style.indexOf('height:100%') !== -1);
    var hasHighOverlay = (position === 'fixed' || position === 'absolute') && zIndex >= 1000;

    return hasHighOverlay && coversMostViewport;
  }

  function elementLooksAd(el) {
    if (!el || !el.tagName) return false;

    var tag = String(el.tagName).toLowerCase();
    var id = (el.id || '').toLowerCase();
    var className = (el.className || '').toString().toLowerCase();
    var name = (el.name || '').toLowerCase();
    var style = (el.getAttribute('style') || '').toLowerCase();
    var text = (el.textContent || '').toLowerCase();
    var dataAttrs = Array.prototype.slice.call(el.attributes || []).map(function (attr) {
      return (attr.name || '') + '=' + (attr.value || '');
    }).join(' ').toLowerCase();

    var src = (
      el.getAttribute('src') ||
      el.getAttribute('data') ||
      el.getAttribute('href') ||
      el.getAttribute('poster') ||
      ''
    ).toLowerCase();

    if (containsAdPattern(src) || containsAdPattern(id) || containsAdPattern(className) || containsAdPattern(name) || containsAdPattern(dataAttrs) || containsAdPattern(text)) {
      return true;
    }

    if (tag === 'script' || tag === 'iframe' || tag === 'img' || tag === 'video' || tag === 'object' || tag === 'embed' || tag === 'ins') {
      if (containsAdPattern(style)) return true;
    }

    if ((tag === 'div' || tag === 'ins' || tag === 'iframe' || tag === 'video' || tag === 'object' || tag === 'embed') && isOverlayLike(el)) {
      return true;
    }

    return false;
  }

  function removeElement(el) {
    try {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    } catch (e) {}
  }

  function removeIfAd(node) {
    if (!node || node.nodeType !== 1) return;

    if (elementLooksAd(node)) {
      removeElement(node);
      return;
    }

    if (node.tagName && node.tagName.toLowerCase() === 'script' && node.textContent && containsAdPattern(node.textContent)) {
      removeElement(node);
    }
  }

  function runCleanup() {
    var selectors = [
      'iframe',
      'div',
      'ins',
      'video',
      'script',
      'object',
      'embed',
      'img',
      'link'
    ];

    selectors.forEach(function (selector) {
      var nodes = getGlobalCssSelector(selector);
      for (var i = 0; i < nodes.length; i++) {
        removeIfAd(nodes[i]);
      }
    });
  }

  function fireBlockedError(el) {
    setTimeout(function () {
      try {
        if (typeof el.onerror === 'function') el.onerror(new Event('error'));
      } catch (e) {}
      try {
        el.dispatchEvent(new Event('error'));
      } catch (e) {}
    }, 0);
  }

  if (window.fetch) {
    var _fetch = window.fetch;
    window.fetch = function (input, init) {
      var url = null;
      try {
        url = typeof input === 'string' ? input : (input && input.url);
      } catch (e) {}
      if (containsAdPattern(url)) {
        return Promise.reject(new Error('Blocked ad request: ' + url));
      }
      return _fetch.apply(this, arguments);
    };
  }

  if (XMLHttpRequest && XMLHttpRequest.prototype) {
    var _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (containsAdPattern(url)) {
        this.__adBlocked = true;
        arguments[1] = 'about:blank';
      }
      return _open.apply(this, arguments);
    };

    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this.__adBlocked) {
        var self = this;
        setTimeout(function () {
          try {
            Object.defineProperty(self, 'status', { value: 0, configurable: true });
            self.dispatchEvent(new Event('error'));
          } catch (e) {}
        }, 0);
        return;
      }
      return _send.apply(this, arguments);
    };
  }

  if (navigator && navigator.sendBeacon) {
    var _sendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url) {
      if (containsAdPattern(url)) {
        return false;
      }
      return _sendBeacon.apply(this, arguments);
    };
  }

  if (window.open) {
    var _windowOpen = window.open.bind(window);
    window.open = function (url) {
      if (containsAdPattern(url)) {
        console.warn('[Ember AdBlock] Blocked ad popup:', url);
        return null;
      }
      return _windowOpen.apply(this, arguments);
    };
  }

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;

    var href = anchor.getAttribute('href') || '';
    if (containsAdPattern(href)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Ember AdBlock] Blocked ad navigation:', href);
    }
  }, true);

  var _createElement = document.createElement;
  document.createElement = function (tagName) {
    var el = _createElement.apply(document, arguments);
    var tag = String(tagName).toLowerCase();
    if (tag === 'script' || tag === 'img' || tag === 'iframe' || tag === 'video' || tag === 'embed' || tag === 'object') {
      try {
        var originalSetAttribute = el.setAttribute;
        el.setAttribute = function (name, value) {
          if ((name === 'src' || name === 'data' || name === 'href') && containsAdPattern(value)) {
            fireBlockedError(el);
            return;
          }
          return originalSetAttribute.apply(this, arguments);
        };

        Object.defineProperty(el, 'src', {
          get: function () {
            return el.getAttribute('src') || '';
          },
          set: function (value) {
            if (containsAdPattern(value)) {
              fireBlockedError(el);
              return;
            }
            originalSetAttribute.call(el, 'src', value);
          },
          configurable: true
        });
      } catch (e) {}
    }
    return el;
  };

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes || [];
      for (var j = 0; j < added.length; j++) {
        removeIfAd(added[j]);
      }
    }
    runCleanup();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'data', 'id', 'class', 'style', 'name']
    });
  }

  runCleanup();
})();
`;

function matchesAdPatterns(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return AD_HTML_BLOCK_PATTERNS.some((pattern) => pattern.test(lower));
}

function getComputedStyleSafe(el) {
  try {
    return window.getComputedStyle(el);
  } catch (e) {
    return null;
  }
}

function getElementDiagnosticResource(el) {
  const values = [
    el.getAttribute('src'),
    el.getAttribute('href'),
    el.getAttribute('data'),
    el.getAttribute('poster'),
    el.id,
    el.className,
    el.textContent
  ];

  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim();
  }

  return '(no URL/resource)';
}

function logBlockedAd(el, reason) {
  const resource = getElementDiagnosticResource(el);
  console.warn('[Ember AdBlock] Blocked:', {
    resource,
    elementType: (el.tagName || 'unknown').toLowerCase(),
    reason
  });
}

function getAdScore(el) {
  if (!el || !el.tagName) return 0;

  const tag = el.tagName.toLowerCase();
  const id = (el.id || '').toLowerCase();
  const className = (el.className || '').toString().toLowerCase();
  const name = (el.name || '').toLowerCase();
  const style = (el.getAttribute('style') || '').toLowerCase();
  const text = (el.textContent || '').toLowerCase();
  const attributes = Array.from(el.attributes || [])
    .map((attr) => `${attr.name}=${attr.value}`)
    .join(' ')
    .toLowerCase();

  const urls = [
    el.getAttribute('src'),
    el.getAttribute('href'),
    el.getAttribute('data'),
    el.getAttribute('poster')
  ].filter(Boolean);

  let score = 0;

  if (tag === 'script' || tag === 'iframe' || tag === 'img' || tag === 'video' || tag === 'object' || tag === 'embed' || tag === 'ins') {
    score += 1;
  }

  urls.forEach((value) => {
    if (matchesAdPatterns(value)) score += 5;
  });

  if (matchesAdPatterns(id)) score += 2;
  if (matchesAdPatterns(className)) score += 2;
  if (matchesAdPatterns(name)) score += 2;
  if (matchesAdPatterns(attributes)) score += 4;
  if (matchesAdPatterns(text)) score += 2;

  const css = getComputedStyleSafe(el);
  const width = parseFloat(css && css.width ? css.width : '0') || 0;
  const height = parseFloat(css && css.height ? css.height : '0') || 0;
  const zIndex = parseInt(css && css.zIndex ? css.zIndex : '0', 10) || 0;
  const position = (css && css.position ? css.position : '').toLowerCase();

  if (position === 'fixed' || position === 'absolute') score += 1;
  if (zIndex >= 900) score += 2;
  if (width > (window.innerWidth || 1) * 0.25 && height > (window.innerHeight || 1) * 0.25) score += 2;

  if ((style.includes('position:fixed') || style.includes('position:absolute')) &&
      (style.includes('width:100%') || style.includes('height:100%'))) {
    score += 2;
  }

  if (tag === 'script' && matchesAdPatterns(el.textContent || '')) score += 4;
  if (tag === 'iframe' && matchesAdPatterns(el.getAttribute('src') || '')) score += 2;
  if (tag === 'div' && matchesAdPatterns(attributes)) score += 1;

  return score;
}

function shouldRemoveAdElement(el) {
  return getAdScore(el) >= 6;
}

function injectAdBlockerShim(doc) {
  const existing = doc.querySelector('script[data-ember-ad-block-shim="true"]');
  if (existing) return;

  const head = doc.head || doc.querySelector('head');
  if (!head) return;

  const shim = doc.createElement('script');
  shim.dataset.emberAdBlockShim = 'true';
  shim.textContent = AD_BLOCKER_SHIM;
  head.insertBefore(shim, head.firstChild);
}

function removeAdLikeNodes(doc) {
  const candidates = Array.from(doc.querySelectorAll('iframe, script, img, video, object, embed, ins, div, link, source, audio'));

  candidates.forEach((el) => {
    if (el && el.dataset && el.dataset.emberAdBlockShim === 'true') return;
    if (!shouldRemoveAdElement(el)) return;

    const reason = `score=${getAdScore(el)}; matched ad-like resource, overlay, or ad container signals`;
    logBlockedAd(el, reason);
    el.remove();
  });

  doc.querySelectorAll('meta[http-equiv="origin-trial"]').forEach((el) => el.remove());
  doc.querySelectorAll('link[rel="compression-dictionary"]').forEach((el) => el.remove());
}

async function sanitizeGameHtml(html, src, depth = 0, seen = new Set()) {
  if (!html) return '';

  const resolvedUrl = new URL(src, window.location.href).href;
  if (seen.has(resolvedUrl)) return '';
  seen.add(resolvedUrl);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const gameBase = new URL('.', resolvedUrl).toString();

  if (depth < MAX_SANITIZE_DEPTH) {
    const iframeNodes = Array.from(doc.querySelectorAll('iframe'));

    for (const iframe of iframeNodes) {
      const iframeSrc = iframe.getAttribute('src');
      if (!iframeSrc) continue;

      const iframeUrl = new URL(iframeSrc, resolvedUrl).href;
      if (seen.has(iframeUrl)) continue;

      try {
        const response = await fetch(iframeUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const nestedHtml = await response.text();
        const sanitizedNestedHtml = await sanitizeGameHtml(nestedHtml, iframeUrl, depth + 1, seen);

        if (sanitizedNestedHtml) {
          iframe.setAttribute('srcdoc', sanitizedNestedHtml);
          iframe.removeAttribute('src');
        }
      } catch (error) {
        console.warn('[Ember AdBlock] Cross-origin iframe could not be inspected:', iframeUrl, error);
      }
    }
  }

  removeAdLikeNodes(doc);
  injectAdBlockerShim(doc);

  doc.querySelectorAll('base').forEach((el) => el.remove());
  if (!doc.querySelector('base')) {
    const base = doc.createElement('base');
    base.href = gameBase;
    const head = doc.head || doc.querySelector('head');
    if (head) head.insertBefore(base, head.firstChild);
  }

  return doc.documentElement.outerHTML;
}

function getGameSaveKey(gameId) {
  return `ember-game-save:${gameId}`;
}

function saveGameProgress(frame, gameId) {
  if (!frame || !gameId || !frame.contentWindow || !frame.contentWindow.localStorage) return;

  try {
    const win = frame.contentWindow;
    const snapshot = {};

    for (let i = 0; i < win.localStorage.length; i++) {
      const key = win.localStorage.key(i);
      if (!key || key.startsWith('ember-')) continue;
      snapshot[key] = win.localStorage.getItem(key);
    }

    if (Object.keys(snapshot).length) {
      localStorage.setItem(getGameSaveKey(gameId), JSON.stringify(snapshot));
    } else {
      localStorage.removeItem(getGameSaveKey(gameId));
    }
  } catch (error) {
    console.warn('Could not save game progress:', error);
  }
}

function restoreGameProgress(frame, gameId) {
  if (!frame || !gameId || !frame.contentWindow || !frame.contentWindow.localStorage) return;

  try {
    const raw = localStorage.getItem(getGameSaveKey(gameId));
    if (!raw) return;

    const snapshot = JSON.parse(raw);
    const win = frame.contentWindow;

    Object.entries(snapshot).forEach(([key, value]) => {
      win.localStorage.setItem(key, String(value));
    });
  } catch (error) {
    console.warn('Could not restore game progress:', error);
  }
}

let gameSaveInterval = null;

function startGameAutoSave(frame, gameId) {
  stopGameAutoSave();
  if (!frame || !gameId) return;

  gameSaveInterval = setInterval(() => {
    saveGameProgress(frame, gameId);
  }, 5000);
}

function stopGameAutoSave() {
  if (gameSaveInterval) {
    clearInterval(gameSaveInterval);
    gameSaveInterval = null;
  }
}

function makeSafeBlockedFallbackHtml(reason) {
  const message = reason ? String(reason).replace(/[<>]/g, '') : 'The ad blocker is active and the game could not be fully sanitized.';
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box;}div{max-width:700px;line-height:1.5;}</style><script>(${AD_BLOCKER_SHIM})();</script></head><body><div>Ember ad blocker is active. This game could not be fully sanitized, so the original game was not loaded unsafely. ${message}</div></body></html>`;
}

async function loadSiteFrame(frame, src) {
  if (!state.settings.blockAds) {
    frame.src = src;
    return;
  }

  try {
    const response = await fetch(src, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load site HTML (${response.status})`);

    const rawHtml = await response.text();
    const cleanedHtml = await sanitizeGameHtmlCentral(rawHtml, src);

    if (!cleanedHtml) {
      throw new Error('The site HTML was empty after sanitization.');
    }

    frame.srcdoc = cleanedHtml;
  } catch (error) {
    console.warn('Site could not be fully sanitized; loading a safe blocker-only fallback instead:', error);
    frame.srcdoc = makeSafeBlockedFallbackHtmlCentral(error && error.message ? error.message : 'Unknown sanitization failure');
  }
}

async function loadGameFrame(frame, src, gameId) {
  frame.onload = () => {
    restoreGameProgress(frame, gameId);
  };

  const isExternalGame = /^https?:\/\//i.test(src);

  if (isExternalGame || !state.settings.blockAds) {
    frame.src = src;
    startGameAutoSave(frame, gameId);
    return;
  }

  try {
    const response = await fetch(src, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load game HTML (${response.status})`);

    const rawHtml = await response.text();
    const cleanedHtml = await sanitizeGameHtmlCentral(rawHtml, src);

    if (!cleanedHtml) {
      throw new Error('The game HTML was empty after sanitization.');
    }

    frame.srcdoc = cleanedHtml;
    startGameAutoSave(frame, gameId);
  } catch (error) {
    console.warn('Game could not be fully sanitized; loading a safe blocker-only fallback instead:', error);
    frame.srcdoc = makeSafeBlockedFallbackHtmlCentral(error && error.message ? error.message : 'Unknown sanitization failure');
    startGameAutoSave(frame, gameId);
  }
}

function closeModal() {
  const root = document.getElementById('modalRoot');
  const backdrop = root.querySelector('.modal-backdrop');
  const frame = root.querySelector('.game-frame');
  const gameId = root.dataset.gameId || '';

  if (frame && gameId) saveGameProgress(frame, gameId);
  stopGameAutoSave();

  if (backdrop) {
    backdrop.classList.add('closing');
    setTimeout(() => (root.innerHTML = ''), 140);
  } else {
    root.innerHTML = '';
  }
}
function openGameModal(g) {
  const root = document.getElementById('modalRoot');
  root.dataset.gameId = g.id;
  const src = /^https?:\/\//i.test((g.file || '').trim()) ? g.file.trim() : `/games/${g.file}`;

  root.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal modal-game">
        <div class="modal-head">
          <h3>${g.title}</h3>
          <div class="modal-actions">
            <button class="tool-btn small favorite-btn" id="favoriteGameBtn" title="Favorite game">
              ${svg('starOutline')} <span>Favorite</span>
            </button>
            <button class="modal-close" id="modalCloseBtn" title="Close">✕</button>
          </div>
        </div>
        <div class="game-frame-wrap">
          <iframe class="game-frame" title="${g.title}" allow="fullscreen; gamepad; autoplay"></iframe>
        </div>
      </div>
    </div>`;

  const favoriteBtn = root.querySelector('#favoriteGameBtn');
  const syncFavoriteUi = () => {
    const isFav = state.favorites.has(g.id);
    favoriteBtn.classList.toggle('on', isFav);
    favoriteBtn.innerHTML = `${svg(isFav ? 'star' : 'starOutline')} <span>${isFav ? 'Favorited' : 'Favorite'}</span>`;
  };

  syncFavoriteUi();

  root.querySelector('#modalCloseBtn').onclick = closeModal;
  favoriteBtn.onclick = () => {
    if (state.favorites.has(g.id)) state.favorites.delete(g.id);
    else state.favorites.add(g.id);
    persist();
    syncFavoriteUi();
  };

  root.querySelector('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });

  const frame = root.querySelector('.game-frame');
  loadGameFrame(frame, src, g.id);
}

/* ---------------- AI panel ---------------- */
function renderAiPanel(panel) {
  const health = getHealth();
  panel.innerHTML = `
    <div class="ai-wrap fade-in">
      ${
        state.aiMessages.length === 0
          ? `
        <div class="ai-hero"><h2>How can ember help?</h2></div>
        <div class="chip-grid" id="chipGrid"></div>
      `
          : `<div class="ai-messages" id="aiMessages"></div>`
      }
      <div class="ai-inputbar">
        <textarea id="aiInput" rows="1" placeholder="Message ember"></textarea>
        <div class="ai-inputbar-row">
          <div class="model-chip ${health.connected ? 'live' : ''}">
            ${svg('sparkle')} ${health.connected ? `Ember · ${health.provider}` : 'Ember Local'}
            <span class="badge">${health.connected ? 'Live' : 'Offline'}</span>
          </div>
          <button class="send-btn" id="aiSend">${svg('send')}</button>
        </div>
      </div>
      <div class="usage-line" id="usageLine"></div>
    </div>`;

  if (state.aiMessages.length === 0) {
    const chipGrid = panel.querySelector('#chipGrid');
    AI_SUGGESTIONS.forEach((s) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = s;
      chip.onclick = () => sendAiMessage(s);
      chipGrid.appendChild(chip);
    });
  } else {
    paintAiMessages(panel);
  }

  const usage = getUsage();
  panel.querySelector('#usageLine').textContent = health.connected
    ? `${usage.count} / ${AI_LIMIT} messages today · connected to ${health.provider}`
    : `${usage.count} / ${AI_LIMIT} messages today · running fully offline in your browser`;

  const input = panel.querySelector('#aiInput');
  const send = panel.querySelector('#aiSend');
  const trySend = () => {
    if (input.value.trim()) sendAiMessage(input.value);
  };
  send.onclick = trySend;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      trySend();
    }
  });
  if (getUsage().count >= AI_LIMIT) {
    send.disabled = true;
    input.placeholder = 'Daily message limit reached — resets tomorrow';
  }
}

function paintAiMessages(panel) {
  const wrap = panel.querySelector('#aiMessages');
  if (!wrap) return;
  wrap.innerHTML = '';
  state.aiMessages.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'msg ' + m.role + ' msg-enter';
    div.textContent = m.text;
    wrap.appendChild(div);
  });
  wrap.scrollTop = wrap.scrollHeight;
}

function showTyping(panel) {
  const wrap = panel.querySelector('#aiMessages');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'msg bot typing msg-enter';
  t.id = 'typingIndicator';
  t.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(t);
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendAiMessage(text) {
  const usage = getUsage();
  if (usage.count >= AI_LIMIT) return;
  const history = state.aiMessages.slice();
  state.aiMessages.push({ role: 'user', text });
  bumpUsage();
  const panel = document.getElementById('panel');
  renderAiPanel(panel);
  const input = panel.querySelector('#aiInput');
  if (input) input.value = '';
  showTyping(panel);

  const { text: replyText } = await getReply(text, history);

  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
  state.aiMessages.push({ role: 'bot', text: replyText });
  renderAiPanel(panel);
}

/* ---------------- master render ---------------- */
function renderAll() {
  renderTabs();
  renderPinned();
  renderBottomNav();
  updateChrome();
  renderPanel();
}

window.addEventListener('keydown', (e) => {
  if (exitKeyCaptureActive) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    state.settings.exitKey = key;
    exitKeyCaptureActive = false;
    persist();
    renderSettings(document.getElementById('panel'));
    return;
  }

  const configuredKey = state.settings.exitKey && state.settings.exitKey.trim();
  if (!configuredKey || e.altKey || e.ctrlKey || e.metaKey) return;

  const normalized = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (normalized !== configuredKey.toLowerCase()) return;

  const exitUrl = state.settings.exitUrl && state.settings.exitUrl.trim();
  if (exitUrl) {
    const url = /^https?:\/\//i.test(exitUrl) ? exitUrl : `https://${exitUrl}`;
    window.location.href = url;
  }
});

if (state.settings.autoCollapse) document.getElementById('sidebar').classList.add('collapsed');
renderAll();
checkHealth().then(() => {
  if (activeTab().view === 'assistant') renderAiPanel(document.getElementById('panel'));
  if (activeTab().view === 'settings') renderSettings(document.getElementById('panel'));
});
