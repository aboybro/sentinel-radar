// Sentinel Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// Safety Score's four pillars and the protocol's farm plan, and the model card. No network:
// every byte it shows is in data.js. Query strings drive the three screenshot views:
//   ?detail=<slug> opens one protocol, ?tier=FORTRESS filters by tier, ?q=<text> searches.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    tier: params.get('tier') || 'all',
    watchlistOnly: params.get('wl') === '1',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    selected: params.get('detail') || null,
  };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. Safety pillars are recomputed the same way, from the row's own figures.
  function safetyOf(row) {
    var age = row.age_days === null || row.age_days === undefined ? null : row.age_days;
    var scale = 30 * Math.min(Math.max((Math.log10(Math.max(row.tvl_usd, 1)) - Math.log10(5000000)) / (Math.log10(10000000000) - Math.log10(5000000)), 0), 1);
    var stability = row.change_7d === null || row.change_7d === undefined ? 15 : 30 * (1 - Math.min(Math.abs(row.change_7d), 100) / 100);
    var endurance = age === null ? 12.5 : 25 * Math.min(age, 1095) / 1095;
    var breadth = 15 * Math.min(Math.max(row.chains.length - 1, 0), 5) / 5;
    return { scale: scale, stability: stability, endurance: endurance, breadth: breadth, total: scale + stability + endurance + breadth };
  }
  function impliedOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    g = Math.min(model.growth_cap, Math.max(model.growth_floor, g));
    var growthMult = 1 + (g / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var endurance = model.endurance_floor + (Math.min(Math.max(age, 0), model.endurance_days) / model.endurance_days) * model.endurance_range;
    var s = safetyOf(row).total;
    var risk = model.risk_floor + model.risk_range * (s / 100);
    return Math.max(1, Math.round(row.tvl_usd * DATA.base_multiple * growthMult * endurance * risk));
  }

  // A row is on the watchlist when main.ts marked it so from the snapshot's own list.
  function isWatchlist(row) { return row.watchlist === true; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  var TIERS = ['FORTRESS', 'SOLID', 'WATCH', 'FRAGILE'];
  var TIER_BLURB = {
    FORTRESS: 'Big, steady, old, multi-chain. Farm with confidence.',
    SOLID: 'Strong on most pillars. One weak spot to watch.',
    WATCH: 'Worth farming, but size the position down.',
    FRAGILE: 'Small, wild or very young. Test with $25 first.',
  };

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.tier !== 'all' && r.risk_tier !== state.tier) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'safety') d = a.safety_score - b.safety_score;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      else if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      return d * dir || (a.rank - b.rank);
    });
    return rows;
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tier !== 'all') p.set('tier', state.tier);
    if (state.watchlistOnly) p.set('wl', '1');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir === 1) p.set('dir', 'asc');
    if (state.selected) p.set('detail', state.selected);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function tierBadge(r) {
    return el('span', { 'class': 'badge tier-' + r.risk_tier }, r.risk_tier);
  }

  function renderBoard() {
    app.innerHTML = '';
    var wrap = el('div', { 'class': 'wrap' });

    var hero = el('header', { 'class': 'hero' },
      el('div', { 'class': 'eyebrow' }, 'Sentinel Radar \u00b7 token-radar-01 \u00b7 model sentinel-1'),
      el('h1', {}, 'Which pre-token protocol is ', el('span', { 'class': 'mark' }, 'safe enough to farm'), '?'),
      el('p', { 'class': 'lede' },
        'A radar that ranks ', el('b', {}, DATA.board_size + ' pre-token protocols'),
        ' by ', el('b', {}, 'risk-adjusted implied value'),
        ': the market value of their TVL, discounted by a Safety Score built from size, weekly stability, age with no token, and chain breadth. A fragile giant ranks below a solid mid-size protocol — that is the whole point.'),
      el('div', { 'class': 'meta' },
        el('span', {}, 'Snapshot ', el('b', {}, DATA.as_of)),
        el('span', {}, 'Watchlist ', el('b', {}, DATA.watchlist_size + ' protocols')),
        el('span', {}, 'Early finds below the floor ', el('b', {}, DATA.early_size)),
        el('span', {}, 'Live-token reference set ', el('b', {}, DATA.live_size)),
        el('span', {}, 'Global market multiple ', el('b', {}, DATA.base_multiple + '\u00d7 TVL'))
      )
    );
    wrap.appendChild(hero);

    var tiers = el('div', { 'class': 'tiers' });
    TIERS.forEach(function (t) {
      tiers.appendChild(el('button', {
        'class': 'tier-card tier-' + t,
        'aria-pressed': state.tier === t ? 'true' : 'false',
        onclick: function () { state.tier = state.tier === t ? 'all' : t; syncUrl(); renderBoard(); },
      },
        el('div', { 'class': 'tn' }, t),
        el('div', { 'class': 'tc' }, String(DATA.tier_counts[t])),
        el('div', { 'class': 'td' }, TIER_BLURB[t])
      ));
    });
    wrap.appendChild(tiers);

    var cats = ['all'];
    var chains = ['all'];
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      if (cats.indexOf(c) < 0) cats.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    cats.sort();
    chains.sort();

    var filters = el('div', { 'class': 'filters' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol\u2026', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; syncUrl(); renderTable(); });
    filters.appendChild(search);
    var catSel = el('select', { 'aria-label': 'Filter by category' });
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c }, c === 'all' ? 'All categories' : c)); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; syncUrl(); renderTable(); });
    filters.appendChild(catSel);
    var chainSel = el('select', { 'aria-label': 'Filter by chain' });
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c }, c === 'all' ? 'All chains' : c)); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; syncUrl(); renderTable(); });
    filters.appendChild(chainSel);
    var wl = el('label', { 'class': 'chk' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? true : null }),
      'Watchlist only');
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; syncUrl(); renderTable(); });
    filters.appendChild(wl);
    var count = el('span', { 'class': 'count' });
    filters.appendChild(count);
    wrap.appendChild(filters);

    var tableWrap = el('div', { id: 'table-wrap' });
    wrap.appendChild(tableWrap);

    var modelSec = el('section', { 'class': 'block' },
      el('h2', {}, 'How the radar scores'),
      el('div', { 'class': 'modelgrid' },
        el('div', { 'class': 'card' },
          el('h3', {}, 'The model, in one line'),
          el('p', {}, 'implied = TVL \u00d7 ', el('code', {}, String(DATA.base_multiple)), ' \u00d7 growth \u00d7 endurance \u00d7 risk'),
          el('p', {}, 'The ', el('code', {}, String(DATA.base_multiple)), '\u00d7 is the median market-cap-to-TVL of the snapshot\u2019s ', DATA.live_size, ' live-token protocols, computed from the snapshot at run time — one market, one multiple, no per-category anchor and no fixed number. Growth is the clamped 7-day change (weight 0.4); endurance rewards age with no token; risk is 0.55 + 0.65 \u00d7 Safety Score / 100.'),
          el('p', {}, 'Safety Score (0–100): scale 30 (log TVL), stability 30 (a wild week is risky, whichever way it moved), endurance 25 (age), breadth 15 (chains). Unknown figures score half their pillar — the radar says what it does not know.'),
          el('p', { 'class': 'note' }, 'Every protocol in the snapshot is scored by the same function. No name is ever special-cased; a protocol that records no token may still have one its DefiLlama record does not carry, and a pre-token protocol may never issue a token at all.')
        ),
        el('div', { 'class': 'card' },
          el('h3', {}, 'What the tiers mean for your money'),
          el('p', {}, 'FORTRESS (\u226575): farm up to $250. SOLID (60–75): $150. WATCH (45–60): $100, after a $10 withdrawal test. FRAGILE (<45): $25 only, and only after a 7-day test withdrawal. The farm plan on each protocol sizes the position to the tier the radar measured.'),
          el('p', {}, 'The board never mixes the market\u2019s own value with a model\u2019s claim: protocols whose token already trades sit below, at their market cap, as the reference the multiple came from.')
        )
      )
    );
    wrap.appendChild(modelSec);

    var liveSec = el('section', { 'class': 'block' },
      el('h2', {}, 'Live tokens — the market the multiple came from'),
      el('p', { 'class': 'note' }, 'The ' + DATA.live_size + ' largest tokens already trading, at market value. Their median mcap/TVL sets the radar\u2019s base multiple.'),
      (function () {
        var grid = el('div', { 'class': 'live' });
        DATA.live.forEach(function (l) {
          grid.appendChild(el('div', {},
            el('b', {}, l.name),
            el('span', {}, fmtUsd(l.mcap_usd) + ' mcap \u00b7 ' + fmtUsd(l.tvl_usd) + ' TVL \u00b7 ' + (l.category || 'Uncategorised'))
          ));
        });
        return grid;
      })()
    );
    wrap.appendChild(liveSec);

    wrap.appendChild(el('footer', {},
      'Sentinel Radar \u00b7 model sentinel-1 \u00b7 snapshot ' + DATA.as_of + ' \u00b7 source: ' + DATA.source +
      ' \u00b7 Implied values are this entry\u2019s own claim, never make.fun\u2019s. A protocol that records no token may still have one; a pre-token protocol may never issue one. Farm only money you can afford to lose.'
    ));

    app.appendChild(wrap);
    app.setAttribute('aria-busy', 'false');

    function renderTable() {
      var rows = filteredRows();
      count.textContent = rows.length + ' of ' + DATA.board_size + ' protocols';
      tableWrap.innerHTML = '';
      if (rows.length === 0) {
        tableWrap.appendChild(el('div', { 'class': 'empty' }, 'No protocol matches that filter. Loosen it and the radar comes back.'));
        return;
      }
      var maxV = rows[0] ? Math.max.apply(null, rows.map(function (r) { return r.implied_value_usd; })) : 1;
      var table = el('table', { 'class': 'board' });
      var head = el('thead', {});
      var hr = el('tr', {});
      [['#', null], ['Protocol', 'name'], ['Risk-adjusted value', 'implied'], ['TVL', 'tvl'], ['Safety', 'safety'], ['7d', 'growth'], ['Age', 'age']].forEach(function (c, i) {
        var th = el('th', { 'class': i >= 2 ? 'num' : '' });
        if (c[1]) {
          var arrow = state.sort === c[1] ? (state.dir === -1 ? ' \u25bc' : ' \u25b2') : '';
          th.appendChild(el('button', {
            onclick: function () {
              if (state.sort === c[1]) state.dir = -state.dir;
              else { state.sort = c[1]; state.dir = -1; }
              syncUrl(); renderTable();
            },
          }, c[0] + arrow));
        } else th.textContent = c[0];
        hr.appendChild(th);
      });
      head.appendChild(hr);
      table.appendChild(head);
      var body = el('tbody', {});
      rows.slice(0, 200).forEach(function (r) {
        var tr = el('tr', {
          'class': state.selected === r.slug ? 'sel' : '',
          onclick: function () { state.selected = r.slug; syncUrl(); renderBoard(); openDrawer(r); },
        });
        tr.appendChild(el('td', { 'class': 'rank' }, String(r.rank)));
        var nameTd = el('td', {});
        nameTd.appendChild(el('span', { 'class': 'name' }, r.name));
        if (isWatchlist(r)) nameTd.appendChild(el('span', { 'class': 'badge wl' }, 'WATCHLIST'));
        nameTd.appendChild(tierBadge(r));
        nameTd.appendChild(el('div', { 'class': 'sub' }, (r.category || 'Uncategorised') + ' \u00b7 ' + r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
        tr.appendChild(nameTd);
        var valTd = el('td', { 'class': 'num' });
        valTd.appendChild(el('b', {}, fmtUsd(r.implied_value_usd)));
        var vb = el('div', { 'class': 'valbar' });
        vb.appendChild(el('i', { style: 'width:' + Math.max(2, Math.round(r.implied_value_usd / maxV * 100)) + '%' }));
        valTd.appendChild(vb);
        tr.appendChild(valTd);
        tr.appendChild(el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd)));
        var safTd = el('td', { 'class': 'num' });
        var sWrap = el('span', { 'class': 'safety tier-' + r.risk_tier });
        var bar = el('span', { 'class': 'bar' });
        bar.appendChild(el('i', { style: 'width:' + r.safety_score + '%' }));
        sWrap.appendChild(bar);
        sWrap.appendChild(el('b', {}, String(r.safety_score)));
        safTd.appendChild(sWrap);
        tr.appendChild(safTd);
        var g = r.change_7d;
        tr.appendChild(el('td', { 'class': 'num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg') }, fmtPct(g)));
        tr.appendChild(el('td', { 'class': 'num' }, fmtAge(r.age_days)));
        body.appendChild(tr);
      });
      table.appendChild(body);
      tableWrap.appendChild(table);
      if (rows.length > 200) {
        tableWrap.appendChild(el('p', { 'class': 'note' }, 'Showing the first 200 of ' + rows.length + ' matches — narrow the filter to see the rest.'));
      }
    }

    renderTable();
    if (state.selected) {
      var sel = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (sel) openDrawer(sel);
    }
    window.__shotReady = true;
  }

  function openDrawer(r) {
    var old = document.querySelector('.drawer');
    if (old) old.remove();
    var s = r.safety;
    var recomputed = impliedOf(r, DATA.model);
    var match = recomputed === r.implied_value_usd;
    var d = el('aside', { 'class': 'drawer', role: 'dialog', 'aria-label': r.name + ' detail' });
    d.appendChild(el('button', {
      'class': 'close',
      onclick: function () { state.selected = null; syncUrl(); d.remove(); renderBoard(); },
    }, 'Close \u00d7'));
    d.appendChild(el('div', { 'class': 'eyebrow' }, 'Rank #' + r.rank + ' \u00b7 ' + (isWatchlist(r) ? 'watchlist' : 'early find')));
    d.appendChild(el('h2', {}, r.name));
    d.appendChild(el('div', {}, tierBadge(r)));
    d.appendChild(el('p', { 'class': 'note' }, (r.category || 'Uncategorised') + ' \u00b7 ' + r.chains.join(', ') + ' \u00b7 tracked since ' + (r.listed_at || 'unknown date') + '.'));
    var kv = el('dl', { 'class': 'kv' });
    [['Risk-adjusted value', fmtUsd(r.implied_value_usd)], ['TVL', fmtUsd(r.tvl_usd)], ['Safety Score', r.safety_score + ' / 100'], ['7-day TVL change', fmtPct(r.change_7d)], ['Age with no token', fmtAge(r.age_days)], ['Chains', String(r.chains.length)]].forEach(function (pair) {
      kv.appendChild(el('div', {}, el('dt', {}, pair[0]), el('dd', {}, pair[1])));
    });
    d.appendChild(kv);
    d.appendChild(el('h3', {}, 'Safety Score — the four pillars'));
    var pillars = el('div', { 'class': 'pillars' });
    [['Scale (log TVL)', s.scale, 30], ['Stability (7d swing)', s.stability, 30], ['Endurance (age)', s.endurance, 25], ['Breadth (chains)', s.breadth, 15]].forEach(function (p) {
      var row = el('div', { 'class': 'pillar' });
      row.appendChild(el('span', {}, p[0]));
      var bar = el('span', { 'class': 'bar' });
      bar.appendChild(el('i', { style: 'width:' + Math.round(p[1] / p[2] * 100) + '%' }));
      row.appendChild(bar);
      row.appendChild(el('b', {}, p[1].toFixed(1) + ' / ' + p[2]));
      pillars.appendChild(row);
    });
    d.appendChild(pillars);
    d.appendChild(el('div', { 'class': 'formula' },
      el('code', {}, 'TVL ' + fmtUsd(r.tvl_usd) + ' \u00d7 ' + DATA.base_multiple + ' \u00d7 growth ' + r.growth_multiplier.toFixed(2) + ' \u00d7 endurance ' + r.endurance_multiplier.toFixed(2) + ' \u00d7 risk ' + r.risk_multiplier.toFixed(2) + ' = ' + fmtUsd(r.implied_value_usd) + (match ? ' \u2713 recomputed in this page' : ''))
    ));
    d.appendChild(el('h3', {}, 'Red flags the radar found'));
    var flags = el('ul', { 'class': 'flags' });
    r.flags.forEach(function (f) {
      var good = f.indexOf('No red flags') === 0;
      flags.appendChild(el('li', { 'class': good ? 'good' : 'bad' }, f));
    });
    d.appendChild(flags);
    d.appendChild(el('h3', {}, 'Farm plan — sized to the ' + r.risk_tier + ' tier'));
    var steps = el('ol', { 'class': 'steps' });
    r.farm_steps.forEach(function (step) {
      var m = step.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      var li = el('li', {});
      if (m) {
        li.appendChild(document.createTextNode(m[1] + ' '));
        li.appendChild(el('span', { 'class': 'cost' }, 'Cost: ' + m[2] + '. Time: ' + m[3] + '.'));
      } else li.textContent = step;
      steps.appendChild(li);
    });
    d.appendChild(steps);
    d.appendChild(el('p', { 'class': 'warn' }, 'This protocol records no token — that is the snapshot\u2019s record, not proof it has none, and it may never issue one. Farm only money you can afford to lose, and never pay anyone to claim for you.'));
    document.body.appendChild(d);
    d.scrollTop = 0;
  }

  renderBoard();
})();
