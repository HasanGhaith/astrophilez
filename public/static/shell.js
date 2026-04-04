/* ============================================================
   shell.js — Astrophiles shared shell
   
   Usage on any page:
     1. In <head>: <script src="/static/shell.js" defer></script>
     2. In <body>: call Shell.init({ active: 'explore' }) after DOM ready
   
   Shell.init(options) injects:
     · starfield canvas + animation
     · Nebulas + grid overlay
     · SVG gradient defs (for rank frames)
     · Left sidenav
     · Mobile top nav
     · Right friends sidebar
     · Bottom nav
     · Mobile overlay
     · Toast container
   
   Options:
     active   — nav item to highlight: 'explore'|'profile'|'leaderboard'|'create'|'arena'
     maxWidth — override .main-content max-width (default '680px')
   
   Public API (window.Shell):
     Shell.init(opts)          — call once on page load
     Shell.showToast(msg, type)— 'success' | 'error' | ''
     Shell.userElo(u)          — extract Elo from any user shape
     Shell.me                  — the loaded session user (null until ready)
     Shell.onMeReady(fn)       — register callback for when /api/profile/me resolves
   ============================================================ */

(function(){
'use strict';

/* ── SVG icons (centralised so HTML stays clean) ── */
const IC = {
  explore:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  profile:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  leaderboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  create:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  arena:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  menu:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  friends:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  search:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  plus:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

/* ── Country data ── */
const CMAP = (()=>{
  const codes = ['AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BT','BO','BA','BW','BR','BN','BG','BF','BI','CV','KH','CM','CA','CF','TD','CL','CN','CO','KM','CG','CR','HR','CU','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FJ','FI','FR','GA','GM','GE','DE','GH','GR','GD','GT','GN','GW','GY','HT','HN','HU','IS','IN','ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MG','MW','MY','MV','ML','MT','MH','MR','MU','MX','FM','MD','MC','MN','ME','MA','MZ','MM','NA','NR','NP','NL','NZ','NI','NE','NG','MK','NO','OM','PK','PW','PA','PG','PY','PE','PH','PL','PT','QA','RO','RU','RW','KN','LC','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SK','SI','SB','SO','ZA','SS','ES','LK','SD','SR','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TO','TT','TN','TR','TM','TV','UG','UA','AE','GB','US','UY','UZ','VU','VE','VN','YE','ZM','ZW'];
  const m = {};
  codes.forEach(x => { m[x] = x.split('').map(ch => String.fromCodePoint(0x1F1E0 + ch.charCodeAt(0) - 65)).join(''); });
  return m;
})();

const COUNTRY_NAMES = {AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',AG:'Antigua and Barbuda',AR:'Argentina',AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',BB:'Barbados',BY:'Belarus',BE:'Belgium',BZ:'Belize',BJ:'Benin',BT:'Bhutan',BO:'Bolivia',BA:'Bosnia and Herzegovina',BW:'Botswana',BR:'Brazil',BN:'Brunei',BG:'Bulgaria',BF:'Burkina Faso',BI:'Burundi',CV:'Cabo Verde',KH:'Cambodia',CM:'Cameroon',CA:'Canada',CF:'Central African Republic',TD:'Chad',CL:'Chile',CN:'China',CO:'Colombia',KM:'Comoros',CG:'Congo',CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CY:'Cyprus',CZ:'Czech Republic',DK:'Denmark',DJ:'Djibouti',DM:'Dominica',DO:'Dominican Republic',EC:'Ecuador',EG:'Egypt',SV:'El Salvador',GQ:'Equatorial Guinea',ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',ET:'Ethiopia',FJ:'Fiji',FI:'Finland',FR:'France',GA:'Gabon',GM:'Gambia',GE:'Georgia',DE:'Germany',GH:'Ghana',GR:'Greece',GD:'Grenada',GT:'Guatemala',GN:'Guinea',GW:'Guinea-Bissau',GY:'Guyana',HT:'Haiti',HN:'Honduras',HU:'Hungary',IS:'Iceland',IN:'India',ID:'Indonesia',IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',JM:'Jamaica',JP:'Japan',JO:'Jordan',KZ:'Kazakhstan',KE:'Kenya',KI:'Kiribati',KP:'North Korea',KR:'South Korea',KW:'Kuwait',KG:'Kyrgyzstan',LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',LR:'Liberia',LY:'Libya',LI:'Liechtenstein',LT:'Lithuania',LU:'Luxembourg',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',MV:'Maldives',ML:'Mali',MT:'Malta',MH:'Marshall Islands',MR:'Mauritania',MU:'Mauritius',MX:'Mexico',FM:'Micronesia',MD:'Moldova',MC:'Monaco',MN:'Mongolia',ME:'Montenegro',MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',NR:'Nauru',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',NI:'Nicaragua',NE:'Niger',NG:'Nigeria',MK:'North Macedonia',NO:'Norway',OM:'Oman',PK:'Pakistan',PW:'Palau',PA:'Panama',PG:'Papua New Guinea',PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',PT:'Portugal',QA:'Qatar',RO:'Romania',RU:'Russia',RW:'Rwanda',KN:'Saint Kitts and Nevis',LC:'Saint Lucia',VC:'Saint Vincent',WS:'Samoa',SM:'San Marino',ST:'Sao Tome and Principe',SA:'Saudi Arabia',SN:'Senegal',RS:'Serbia',SC:'Seychelles',SL:'Sierra Leone',SG:'Singapore',SK:'Slovakia',SI:'Slovenia',SB:'Solomon Islands',SO:'Somalia',ZA:'South Africa',SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',SR:'Suriname',SE:'Sweden',CH:'Switzerland',SY:'Syria',TW:'Taiwan',TJ:'Tajikistan',TZ:'Tanzania',TH:'Thailand',TL:'Timor-Leste',TG:'Togo',TO:'Tonga',TT:'Trinidad and Tobago',TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',TV:'Tuvalu',UG:'Uganda',UA:'Ukraine',AE:'UAE',GB:'United Kingdom',US:'United States',UY:'Uruguay',UZ:'Uzbekistan',VU:'Vanuatu',VE:'Venezuela',VN:'Vietnam',YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe'};

/* ── Rank system (must stay in sync with scoring.js thresholds) ── */
const RANKS = [
  { key:'legend', min:1600, label:'✦ Legend' },
  { key:'expert', min:1150, label:'⬡ Expert' },
  { key:'pro',    min:900,  label:'◈ Pro'    },
  { key:'rookie', min:700,  label:'◇ Rookie' },
  { key:'novice', min:500,  label:'▹ Novice' },
  { key:'starter',min:0,    label:'· Starter'},
];

/* ── State ── */
let _me = null;
const _meCallbacks = [];

/* ── Public helpers ── */
function userElo(u) {
  if (!u) return 0;
  if (u.solver_rating > 5)   return Math.round(u.solver_rating);
  if (u.elo > 5)             return Math.round(u.elo);
  const s1 = (+(u.solver_score||0))  + (+(u.creator_score||0));
  if (s1 > 0) return s1;
  const s2 = (+(u.solver_points||0)) + (+(u.creator_points||0));
  if (s2 > 0) return s2;
  if (+(u.score||0)  > 0) return Math.round(u.score);
  if (+(u.points||0) > 0) return Math.round(u.points);
  if (+(u.rating||0) > 5) return Math.round(u.rating);
  return 0;
}

function getRank(elo) {
  return RANKS.find(r => elo >= r.min) || RANKS[RANKS.length - 1];
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type = '') {
  const c = document.getElementById('shell-toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
}

/* ── Starfield ── */
function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function mkStar() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.6,
      opacity: Math.random(),
      speed: Math.random() * 0.012 + 0.003,
      dir: Math.random() > 0.5 ? 1 : -1,
    };
  }

  function init() {
    stars = [];
    const n = Math.floor(canvas.width * canvas.height / 3200);
    for (let i = 0; i < n; i++) stars.push(mkStar());
  }

  function draw(s) {
    s.opacity += s.speed * s.dir;
    if (s.opacity > 1 || s.opacity < 0) s.dir *= -1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.abs(s.opacity)})`;
    ctx.fill();
  }

  function anim() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(draw);
    requestAnimationFrame(anim);
  }

  window.addEventListener('resize', () => { resize(); init(); });
  resize(); init(); anim();
}

/* ── Sidebar logic ── */
function toggleSidenav() {
  const n  = document.getElementById('shell-sidenav');
  const ov = document.getElementById('shell-overlay');
  const fs = document.getElementById('shell-friends-sidebar');
  const open = n.classList.toggle('open');
  ov.classList.toggle('open', open);
  if (fs) fs.classList.remove('open');
}

function toggleFriendsSidebar() {
  const s  = document.getElementById('shell-friends-sidebar');
  const ov = document.getElementById('shell-overlay');
  const n  = document.getElementById('shell-sidenav');
  if (!s) return;
  const open = s.classList.toggle('open');
  ov.classList.toggle('open', open);
  n.classList.remove('open');
}

function closeAllPanels() {
  document.getElementById('shell-sidenav')?.classList.remove('open');
  document.getElementById('shell-friends-sidebar')?.classList.remove('open');
  document.getElementById('shell-overlay')?.classList.remove('open');
}

/* ── Friends sidebar data ── */
let _allFriends = [];

async function loadFriendsList() {
  if (!_me) return;
  const list = document.getElementById('shell-friends-list');
  const countEl = document.getElementById('shell-friends-count');
  try {
    const r = await fetch(`/api/users/${_me._id}`, { credentials: 'same-origin' });
    const d = await r.json();
    if (!d.success) throw new Error();
    const ids = d.user?.following || [];
    if (countEl) countEl.textContent = ids.length;
    if (!ids.length) {
      list.innerHTML = `<div class="friends-empty"><div class="friends-empty-icon">👥</div><p>Not following anyone yet.</p><a href="/explore" style="color:var(--accent);text-decoration:none;font-size:0.82rem;">Find people</a></div>`;
      loadSidebarLb(); return;
    }
    const settled = await Promise.allSettled(
      ids.slice(0, 50).map(id => fetch(`/api/users/${id}`, { credentials: 'same-origin' }).then(x => x.json()))
    );
    _allFriends = settled.filter(x => x.status === 'fulfilled' && x.value?.success).map(x => x.value.user);
    renderFriends(_allFriends);
    loadSidebarLb();
  } catch {
    list.innerHTML = `<div class="friends-empty"><p>Could not load.</p></div>`;
    loadSidebarLb();
  }
}

function renderFriends(list) {
  const el = document.getElementById('shell-friends-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = `<div class="friends-empty"><p>No results.</p></div>`; return; }
  const sorted = [...list].sort((a, b) => userElo(b) - userElo(a));
  el.innerHTML = '';
  sorted.forEach(u => {
    const elo = userElo(u);
    const name = u.displayName || u.username || '?';
    const row = document.createElement('div');
    row.className = 'friend-item';
    row.onclick = () => goToProfile(u._id || u.id, u.username);
    row.innerHTML = `
      <div class="friend-avatar">${name[0].toUpperCase()}</div>
      <div class="friend-info">
        <div class="friend-name">${esc(name)} <span>${CMAP[u.country] || ''}</span></div>
        <div class="friend-pts"><span class="friend-pts-val">${elo} Elo</span> · ${getRank(elo).label}</div>
      </div>`;
    el.appendChild(row);
  });
}

function filterFriends(q) {
  const s = q.toLowerCase().trim();
  renderFriends(s
    ? _allFriends.filter(u => (u.displayName || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s))
    : _allFriends);
}

async function loadSidebarLb() {
  try {
    const r = await fetch('/api/leaderboard', { credentials: 'same-origin' });
    if (!r.ok) return;
    const d = await r.json();
    const raw = d.users || d.data || (Array.isArray(d) ? d : []);
    const top3 = [...raw].sort((a, b) => userElo(b) - userElo(a)).slice(0, 3);
    if (!top3.length) return;
    const section = document.getElementById('shell-sidebar-lb');
    const elList  = document.getElementById('shell-sidebar-lb-list');
    if (!section || !elList) return;
    section.style.display = 'block';
    const medals = ['gold', 'silver', 'bronze'];
    elList.innerHTML = '';
    top3.forEach((u, i) => {
      const elo  = userElo(u);
      const name = u.displayName || u.username || u.name || '?';
      const uid  = u._id || u.id;
      const row  = document.createElement('div');
      row.className = 'lb-sidebar-row';
      row.onclick = () => goToProfile(uid, u.username);
      row.innerHTML = `
        <div class="lb-sidebar-rank ${medals[i]}">${i + 1}</div>
        <div class="friend-avatar" style="width:28px;height:28px;font-size:0.7rem;">${name[0].toUpperCase()}</div>
        <div class="lb-sidebar-info">
          <div class="lb-sidebar-name">${esc(name)}</div>
          <div class="lb-sidebar-pts">${elo} Elo</div>
        </div>`;
      elList.appendChild(row);
    });
  } catch(e) { console.error('[Shell] loadSidebarLb:', e); }
}

function goToProfile(userId, username) {
  if (_me && String(userId) === String(_me._id)) {
    window.location.href = '/profile';
  } else {
    const p = new URLSearchParams();
    if (userId) p.set('id', userId);
    else if (username) p.set('name', username);
    window.location.href = `/profile?${p}`;
  }
}

/* ── Update nav user card ── */
function _updateNavUser(u) {
  const card   = document.getElementById('shell-nav-user-card');
  const avatar = document.getElementById('shell-nav-avatar');
  const name   = document.getElementById('shell-nav-name');
  const pts    = document.getElementById('shell-nav-pts');
  if (!card) return;
  const initial = (u.displayName || u.username || '?')[0].toUpperCase();
  if (avatar) avatar.textContent = initial;
  if (name)   name.textContent   = u.displayName || u.username;
  if (pts)    pts.textContent    = userElo(u);
  card.style.display = 'flex';
}

/* ── Load session user ── */
async function _loadMe() {
  try {
    const r = await fetch('/api/profile/me', { credentials: 'same-origin' });
    if (r.status === 401) { window.location.href = '/auth'; return; }
    const d = await r.json();
    if (d.success && d.user) {
      _me = d.user;
      _updateNavUser(_me);
      loadFriendsList();
      _meCallbacks.forEach(fn => fn(_me));
    }
  } catch(e) { console.error('[Shell] loadMe:', e); }
}

/* ── HTML builders ── */
function _buildSVGDefs() {
  return `<svg width="0" height="0" style="position:absolute;overflow:hidden;" aria-hidden="true"><defs>
    <linearGradient id="gStarter" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6b4a30"/><stop offset="50%" stop-color="#4a3020"/><stop offset="100%" stop-color="#6b4a30"/></linearGradient>
    <linearGradient id="gNovice"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6a7a5a"/><stop offset="50%" stop-color="#485840"/><stop offset="100%" stop-color="#6a7a5a"/></linearGradient>
    <linearGradient id="gRookie"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3a5080"/><stop offset="40%" stop-color="#2a3a60"/><stop offset="100%" stop-color="#4a6090"/></linearGradient>
    <linearGradient id="gPro"     x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffd060"/><stop offset="35%" stop-color="#d4851a"/><stop offset="65%" stop-color="#f3b030"/><stop offset="100%" stop-color="#ffd060"/></linearGradient>
    <linearGradient id="gExpert"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c0d0f0"/><stop offset="30%" stop-color="#8090c0"/><stop offset="60%" stop-color="#d0e0ff"/><stop offset="100%" stop-color="#9090d0"/></linearGradient>
    <linearGradient id="gLegend"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f3d13b"/><stop offset="25%" stop-color="#ff9050"/><stop offset="50%" stop-color="#f3d13b"/><stop offset="75%" stop-color="#e040fb"/><stop offset="100%" stop-color="#f3d13b"/></linearGradient>
    <filter id="fGlow"  x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
    <filter id="fGlowS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="4"   result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
  </defs></svg>`;
}

function _buildSidenav(active) {
  const item = (key, href, label, extra = '') => {
    const isActive  = active === key ? ' active' : '';
    const isArena   = key === 'arena' ? ' arena-item' : '';
    const isButton  = key === 'leaderboard';
    const tag       = isButton ? 'button' : 'a';
    const hrefAttr  = isButton ? `onclick="window.location.href='/explore#leaderboard'"` : `href="${href}"`;
    return `<${tag} ${hrefAttr} class="nav-item${isActive}${isArena}" ${extra}>${IC[key]}${label}</${tag}>`;
  };
  return `
  <nav class="sidenav" id="shell-sidenav">
    <a href="/explore" class="sidenav-logo"><div class="sidenav-logo-mark">✦</div>Astrophiles</a>
    <div class="nav-section-label">Menu</div>
    ${item('explore',     '/explore',    'Explore')}
    ${item('profile',     '/profile',    'Profile')}
    ${item('leaderboard', '',            'Leaderboard')}
    ${item('create',      '/create',     'Create Problem')}
    ${item('arena',       '/challenges', 'Math Arena ⚡')}
    <div class="nav-spacer"></div>
    <a href="/create" class="nav-post-btn">${IC.plus}Post Problem</a>
    <a href="/profile" class="nav-user-card" id="shell-nav-user-card" style="display:none;">
      <div class="nav-user-avatar" id="shell-nav-avatar">?</div>
      <div class="nav-user-info">
        <div class="nav-user-name" id="shell-nav-name">—</div>
        <div class="nav-user-pts"><span id="shell-nav-pts">0</span> Elo</div>
      </div>
    </a>
  </nav>`;
}

function _buildTopNav() {
  return `
  <nav class="top-nav" id="shell-top-nav">
    <div style="display:flex;align-items:center;gap:8px;">
      <button class="mobile-menu-btn" onclick="Shell.toggleSidenav()" style="display:flex;">${IC.menu}</button>
      <a href="/explore" class="nav-logo"><div class="nav-logo-mark">✦</div>Astrophiles</a>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <button class="mobile-menu-btn" onclick="Shell.toggleFriendsSidebar()" style="display:flex;">${IC.friends}</button>
      <a href="/create" class="btn-post">${IC.plus}Post</a>
    </div>
  </nav>`;
}

function _buildFriendsSidebar() {
  return `
  <aside class="friends-sidebar" id="shell-friends-sidebar">
    <div class="friends-header">
      <span>Following</span>
      <span class="friends-count" id="shell-friends-count">0</span>
    </div>
    <div class="friends-search-wrap">
      ${IC.search.replace('<svg', '<svg class="friends-search-icon"')}
      <input class="friends-search" id="shell-friends-search" type="text"
             placeholder="Search following…" oninput="Shell.filterFriends(this.value)"/>
    </div>
    <div class="friends-list" id="shell-friends-list">
      <div class="sk-friend"><div class="sk" style="width:34px;height:34px;border-radius:50%;flex-shrink:0;"></div><div style="flex:1;"><div class="sk" style="width:90px;height:11px;margin-bottom:5px;"></div><div class="sk" style="width:55px;height:9px;"></div></div></div>
      <div class="sk-friend"><div class="sk" style="width:34px;height:34px;border-radius:50%;flex-shrink:0;"></div><div style="flex:1;"><div class="sk" style="width:90px;height:11px;margin-bottom:5px;"></div><div class="sk" style="width:55px;height:9px;"></div></div></div>
    </div>
    <div class="lb-sidebar-section" id="shell-sidebar-lb" style="display:none;">
      <div class="lb-sidebar-title">🏆 Top Players</div>
      <div id="shell-sidebar-lb-list"></div>
    </div>
  </aside>`;
}

function _buildBottomNav(active) {
  const item = (key, href, label, cls = '') => {
    const isActive = active === key ? ' active' : '';
    const isArena  = key === 'arena' ? ' arena' : '';
    if (key === 'leaderboard') {
      return `<button class="bottom-nav-item${isActive}" onclick="window.location.href='/explore#leaderboard'">${IC[key]}${label}</button>`;
    }
    return `<a href="${href}" class="bottom-nav-item${isActive}${isArena} ${cls}">${IC[key]}${label}</a>`;
  };
  return `
  <nav class="bottom-nav" id="shell-bottom-nav">
    ${item('explore',     '/explore',    'Explore')}
    ${item('leaderboard', '',            'Leaders')}
    ${item('arena',       '/challenges', 'Arena')}
    ${item('create',      '/create',     'Create')}
    ${item('profile',     '/profile',    'Me')}
  </nav>`;
}

/* ── Main init ── */
function init(opts = {}) {
  const active = opts.active || '';

  // Background elements (insert before everything else)
  const bg = document.createElement('div');
  bg.innerHTML = `
    <canvas id="starfield"></canvas>
    <div class="nebula nebula-1"></div>
    <div class="nebula nebula-2"></div>
    <div class="nebula nebula-3"></div>
    <div class="grid-overlay"></div>
    <div class="toast-container" id="shell-toast-container"></div>
    <div class="mobile-overlay" id="shell-overlay" onclick="Shell.closeAllPanels()"></div>
    ${_buildSVGDefs()}`;
  while (bg.firstChild) document.body.insertBefore(bg.firstChild, document.body.firstChild);

  // Wrap page content in app-shell if not already present
  let appShell = document.querySelector('.app-shell');
  if (!appShell) {
    appShell = document.createElement('div');
    appShell.className = 'app-shell';
    // Move remaining body children (except what we just inserted) into appShell
    const toMove = Array.from(document.body.children).filter(el =>
      !['starfield','shell-toast-container','shell-overlay'].includes(el.id) &&
      !el.classList.contains('nebula') &&
      !el.classList.contains('grid-overlay') &&
      el.tagName !== 'SVG' &&
      !el.querySelector('#gStarter') // the defs SVG
    );
    toMove.forEach(el => appShell.appendChild(el));
    document.body.appendChild(appShell);
  }

  // Inject sidenav + friends sidebar into appShell
  appShell.insertAdjacentHTML('afterbegin', _buildSidenav(active));
  appShell.insertAdjacentHTML('beforeend',  _buildFriendsSidebar());

  // Inject top nav into .main-content if present
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.insertAdjacentHTML('afterbegin', _buildTopNav());

  // Inject bottom nav into body
  document.body.insertAdjacentHTML('beforeend', _buildBottomNav(active));

  // Keyboard shortcut: Escape closes everything
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllPanels();
  });

  // Start starfield
  initStarfield();

  // Load session user
  _loadMe();
}

/* ── Public API ── */
window.Shell = {
  init,
  showToast,
  userElo,
  getRank,
  esc,
  goToProfile,
  toggleSidenav,
  toggleFriendsSidebar,
  closeAllPanels,
  filterFriends,
  CMAP,
  COUNTRY_NAMES,
  get me() { return _me; },
  onMeReady(fn) {
    if (_me) fn(_me); else _meCallbacks.push(fn);
  },
};

})();