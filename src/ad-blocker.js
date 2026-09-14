const MAX_SANITIZE_DEPTH = 3;

export const AD_HTML_BLOCK_PATTERNS = [
  /doubleclick/i,
  /googlesyndication/i,
  /googletagservices/i,
  /googletagmanager/i,
  /googleadmanager/i,
  /googleadservices/i,
  /adservice\.google\.com/i,
  /imasdk\.googleapis/i,
  /s0\.2mdn\.net/i,
  /2mdn\.net/i,
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
  /googleads/i,
  /ads-\b/i
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
    var selectors = ['iframe', 'div', 'ins', 'video', 'script', 'object', 'embed', 'img', 'link'];

    selectors.forEach(function (selector) {
      var nodes = document.querySelectorAll(selector);
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
        console.warn('[Ember AdBlock] Blocked fetch:', url);
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
        console.warn('[Ember AdBlock] Blocked XHR:', url);
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
        console.warn('[Ember AdBlock] Blocked beacon:', url);
        return false;
      }
      return _sendBeacon.apply(this, arguments);
    };
  }

  if (window.open) {
    var _windowOpen = window.open.bind(window);
    window.open = function (url) {
      if (containsAdPattern(url)) {
        console.warn('[Ember AdBlock] Blocked popup:', url);
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
            console.warn('[Ember AdBlock] Blocked element attribute:', value);
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
              console.warn('[Ember AdBlock] Blocked script/iframe/image:', value);
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
})();`;

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

export function injectAdBlockerShim(doc) {
  const existing = doc.querySelector('script[data-ember-ad-block-shim="true"]');
  if (existing) return;

  const head = doc.head || doc.querySelector('head');
  if (!head) return;

  const shim = doc.createElement('script');
  shim.dataset.emberAdBlockShim = 'true';
  shim.textContent = AD_BLOCKER_SHIM;
  head.insertBefore(shim, head.firstChild);
}

export function removeAdLikeNodes(doc) {
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

export async function sanitizeGameHtml(html, src, depth = 0, seen = new Set()) {
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

export function makeSafeBlockedFallbackHtml(reason) {
  const message = reason ? String(reason).replace(/[<>]/g, '') : 'The ad blocker is active and the game could not be fully sanitized.';
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box;}div{max-width:700px;line-height:1.5;}</style><script>(${AD_BLOCKER_SHIM})();</script></head><body><div>Ember ad blocker is active. This game could not be fully sanitized, so the original game was not loaded unsafely. ${message}</div></body></html>`;
}
