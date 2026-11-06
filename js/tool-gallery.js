/* 工具画廊（机场 / API 推荐）交互脚本：视图切换 / 排序 / 筛选 / 搜索 / 存续天数 / 密码锁 */
(function () {
  function sha256(str) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function parseDate(s) {
    if (!s) return null;
    var m = String(s).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function init() {
    var root = document.getElementById('tg-page');
    if (!root || root.dataset.inited) return;
    root.dataset.inited = '1';
    var key = root.dataset.key;

    var grid = root.querySelector('.tg-grid');
    var tbody = root.querySelector('.tg-table tbody');
    var cards = Array.prototype.slice.call(root.querySelectorAll('.tg-card'));
    var rows = Array.prototype.slice.call(root.querySelectorAll('.tg-table tbody tr'));
    var all = cards.concat(rows);

    // ---------- 存续天数（实时计算，截止为空/至今 则按今天） ----------
    var today = new Date(); today.setHours(0, 0, 0, 0);
    all.forEach(function (el) {
      var s = parseDate(el.dataset.start);
      var e = parseDate(el.dataset.end);
      var ongoing = !e;
      if (!e) e = today;
      var days = s ? Math.max(0, Math.round((e - s) / 86400000)) : -1;
      el.dataset.days = days;
      el.querySelectorAll('.js-days').forEach(function (n) { n.textContent = days >= 0 ? days + ' 天' : '—'; });
      el.querySelectorAll('.js-end').forEach(function (n) { n.textContent = ongoing ? (el.dataset.endText || '至今') : fmt(e); });
    });

    // ---------- 点击跳转笔记 ----------
    all.forEach(function (el) {
      var link = el.dataset.note;
      if (!link) return;
      el.classList.add('clickable');
      el.addEventListener('click', function (ev) {
        if (ev.target.closest('a')) return;
        if (window.pjax) pjax.loadUrl(link); else location.href = link;
      });
    });

    // ---------- 视图切换 ----------
    var viewKey = 'tg_view_' + key;
    var gridView = root.querySelector('.tg-view-grid');
    var tableView = root.querySelector('.tg-view-table');
    function setView(v) {
      gridView.classList.toggle('tg-hidden', v !== 'grid');
      tableView.classList.toggle('tg-hidden', v !== 'table');
      root.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
      try { localStorage.setItem(viewKey, v); } catch (e) {}
    }
    root.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    var savedView = null;
    try { savedView = localStorage.getItem(viewKey); } catch (e) {}
    setView(savedView || root.dataset.defaultView || 'grid');

    // ---------- 排序 ----------
    var sortSel = root.querySelector('.tg-sort');
    function num(v, def) { var n = parseFloat(v); return isNaN(n) ? def : n; }
    var sorters = {
      default: function (a, b) { return num(a.dataset.index, 0) - num(b.dataset.index, 0); },
      // 每100G·月单价排序（未填流量/价格的排最后）
      price_per100g_asc: function (a, b) { return num(a.dataset.pricePer100g, Infinity) - num(b.dataset.pricePer100g, Infinity); },
      price_per100g_desc: function (a, b) { return num(b.dataset.pricePer100g, -Infinity) - num(a.dataset.pricePer100g, -Infinity); },
      // 月均价格排序
      monthly_asc: function (a, b) { return num(a.dataset.monthlyPrice, Infinity) - num(b.dataset.monthlyPrice, Infinity); },
      monthly_desc: function (a, b) { return num(b.dataset.monthlyPrice, -Infinity) - num(a.dataset.monthlyPrice, -Infinity); },
      price_asc: function (a, b) { return num(a.dataset.price, Infinity) - num(b.dataset.price, Infinity); },
      price_desc: function (a, b) { return num(b.dataset.price, -Infinity) - num(a.dataset.price, -Infinity); },
      usage: function (a, b) { return num(a.dataset.usageRank, 99) - num(b.dataset.usageRank, 99) || sorters.default(a, b); },
      days_desc: function (a, b) { return num(b.dataset.days, -1) - num(a.dataset.days, -1); },
      start_asc: function (a, b) { return (a.dataset.start || '9999') < (b.dataset.start || '9999') ? -1 : 1; },
      start_desc: function (a, b) { return (a.dataset.start || '') > (b.dataset.start || '') ? -1 : 1; }
    };
    function applySort(name) {
      var fn = sorters[name] || sorters.default;
      cards.slice().sort(fn).forEach(function (c) { grid.appendChild(c); });
      rows.slice().sort(fn).forEach(function (r) { tbody.appendChild(r); });
    }
    if (sortSel) sortSel.addEventListener('change', function () { applySort(sortSel.value); });
    root.querySelectorAll('.tg-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var s = th.dataset.sort;
        if (s === 'price') s = sortSel.value === 'price_asc' ? 'price_desc' : 'price_asc';
        // 月均 / 百G单价 列：再次点击切换升降序
        if (s === 'monthly_asc') s = sortSel.value === 'monthly_asc' ? 'monthly_desc' : 'monthly_asc';
        if (s === 'price_per100g_asc') s = sortSel.value === 'price_per100g_asc' ? 'price_per100g_desc' : 'price_per100g_asc';
        if (sortSel) sortSel.value = s;
        applySort(s);
      });
    });

    // ---------- 筛选区折叠 / 展开 ----------
    var filterToggle = root.querySelector('#tg-filter-toggle');
    var filterBox = root.querySelector('#tg-filters');
    if (filterToggle && filterBox) {
      filterToggle.addEventListener('click', function () {
        var collapsed = filterBox.classList.toggle('tg-collapsed');
        filterToggle.classList.toggle('active', !collapsed);
        filterToggle.setAttribute('aria-expanded', String(!collapsed));
      });
    }

    // ---------- 筛选 + 搜索 ----------
    var selected = {};
    var searchInput = root.querySelector('.tg-search');
    var countEl = root.querySelector('.tg-count');
    var emptyEls = root.querySelectorAll('.tg-empty');
    function match(el) {
      var attrs = {};
      try { attrs = JSON.parse(el.dataset.attrs || '{}'); } catch (e) {}
      for (var g in selected) {
        var want = selected[g];
        if (!want.length) continue;
        var have = [].concat(attrs[g] || []);
        if (!want.some(function (w) { return have.indexOf(w) > -1; })) return false;
      }
      var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      if (q && (el.dataset.search || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    }
    function applyFilter() {
      var visible = 0;
      cards.forEach(function (c) { var ok = match(c); c.classList.toggle('tg-hidden', !ok); if (ok) visible++; });
      rows.forEach(function (r) { r.classList.toggle('tg-hidden', !match(r)); });
      if (countEl) countEl.textContent = '共 ' + visible + ' / ' + cards.length + ' 项';
      emptyEls.forEach(function (e) { e.style.display = visible ? 'none' : 'block'; });
    }
    root.querySelectorAll('.tg-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var g = chip.dataset.group, v = chip.dataset.value;
        selected[g] = selected[g] || [];
        if (v === '__all') {
          selected[g] = [];
        } else {
          var i = selected[g].indexOf(v);
          if (i > -1) selected[g].splice(i, 1); else selected[g].push(v);
        }
        root.querySelectorAll('.tg-chip[data-group="' + g + '"]').forEach(function (c) {
          c.classList.toggle('active', c.dataset.value === '__all' ? !selected[g].length : selected[g].indexOf(c.dataset.value) > -1);
        });
        applyFilter();
      });
    });
    if (searchInput) searchInput.addEventListener('input', applyFilter);
    var resetBtn = root.querySelector('.tg-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      selected = {};
      if (searchInput) searchInput.value = '';
      root.querySelectorAll('.tg-chip').forEach(function (c) { c.classList.toggle('active', c.dataset.value === '__all'); });
      if (sortSel) { sortSel.value = 'default'; applySort('default'); }
      applyFilter();
    });
    applyFilter();

    // ---------- 密码锁 ----------
    var modal = root.querySelector('#tg-auth-modal');
    var locked = document.getElementById('tg-locked-area');
    if (!modal || !locked) return;
    // 移到 body 下，避免父级 transform 影响 fixed 定位
    removeStrayModal();
    document.body.appendChild(modal);
    var hash = root.dataset.hash;
    var storeKey = 'tg_auth_' + key;
    var input = modal.querySelector('input');
    var err = modal.querySelector('.tg-auth-err');
    var card = modal.querySelector('.tg-auth-card');
    var relock = root.querySelector('.tg-relock');

    function setLocked(isLocked) {
      locked.classList.toggle('is-locked', isLocked);
      modal.classList.toggle('show', isLocked);
      if (relock) relock.classList.toggle('tg-hidden', isLocked);
      if (isLocked && input) setTimeout(function () { input.focus(); }, 200);
    }
    var saved = null;
    try { saved = localStorage.getItem(storeKey); } catch (e) {}
    setLocked(saved !== hash);

    function submit() {
      sha256(input.value.trim()).then(function (h) {
        if (h && h === hash) {
          try { localStorage.setItem(storeKey, hash); } catch (e) {}
          err.classList.remove('show');
          input.value = '';
          setLocked(false);
        } else {
          err.classList.add('show');
          card.classList.remove('tg-shake'); void card.offsetWidth; card.classList.add('tg-shake');
          input.select();
        }
      });
    }
    modal.querySelector('.tg-auth-submit').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var back = modal.querySelector('.tg-auth-back');
    if (back) back.addEventListener('click', function () {
      modal.classList.remove('show');
      if (window.pjax) pjax.loadUrl('/'); else location.href = '/';
    });
    if (relock) relock.addEventListener('click', function () {
      try { localStorage.removeItem(storeKey); } catch (e) {}
      setLocked(true);
    });
  }

  function removeStrayModal() {
    document.querySelectorAll('body > #tg-auth-modal').forEach(function (m) { m.remove(); });
  }

  window.tgInit = init;
  if (!window.__tgBound) {
    window.__tgBound = true;
    document.addEventListener('pjax:send', removeStrayModal);
    document.addEventListener('pjax:complete', init);
  }
  init();
})();
