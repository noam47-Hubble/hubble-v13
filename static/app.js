// ---------------------------------------------------------------------------
// Screen navigation
// ---------------------------------------------------------------------------

const screens = {
  home: document.getElementById('screen-home'),
  cards: document.getElementById('screen-cards'),
  contacts: document.getElementById('screen-contacts'),
  messages: document.getElementById('screen-messages'),
  hub: document.getElementById('screen-hub'),
  conferenceSetup: document.getElementById('screen-conference-setup'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  if (name === 'home') { loadHubs(); leaveCurrentHub(); loadSyncCode(); }
  if (name === 'cards') loadCards();
  if (name === 'contacts') { loadContacts(); loadGroups(); }
  if (name === 'messages') loadMessages();
}

document.getElementById('btn-home').addEventListener('click', () => showScreen('home'));
document.getElementById('home-unread-dot').addEventListener('click', e => {
  e.stopPropagation();
  showScreen('messages');
  clearUnread();
  loadMessages();
});
document.querySelectorAll('.btn-back').forEach(btn => btn.addEventListener('click', () => showScreen('home')));
document.getElementById('btn-my-cards').addEventListener('click', () => showScreen('cards'));
document.getElementById('btn-my-contacts').addEventListener('click', () => showScreen('contacts'));
document.getElementById('btn-my-messages').addEventListener('click', () => { showScreen('messages'); clearUnread(); });
document.getElementById('active-card-chip').addEventListener('click', () => showScreen('cards'));

// ---------------------------------------------------------------------------
// Registration / login (first-run) + invite-link landing (?hub=<id>)
// ---------------------------------------------------------------------------

async function checkRegistration() {
  const res = await fetch('/api/whoami');
  const data = await res.json();
  if (!data.registered) {
    document.getElementById('register-overlay').classList.remove('hidden');
  }
}

document.getElementById('btn-register-submit').addEventListener('click', async () => {
  const name = document.getElementById('reg-name-input').value.trim();
  const email = document.getElementById('reg-email-input').value.trim();
  const phone = document.getElementById('reg-phone-input').value.trim();
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone }),
  });
  const data = await res.json();
  const errEl = document.getElementById('register-error');
  if (!res.ok) {
    errEl.textContent = data.error || 'שגיאה';
    errEl.classList.remove('hidden');
    return;
  }
  document.getElementById('register-overlay').classList.add('hidden');
  if (data.logged_in_as_existing) {
    alert(`נמצא חשבון קיים על שם ${data.reg_name} — התחברת אליו.`);
    location.reload();
  }
});

async function checkInviteLink() {
  const params = new URLSearchParams(location.search);
  const hubId = params.get('hub');
  if (!hubId) return;
  const res = await fetch(`/api/hubs/${hubId}`);
  if (!res.ok) return;
  const hub = await res.json();
  document.getElementById('invite-hub-name').textContent = hub.name;

  const cardsRes = await fetch('/api/cards');
  const myCards = await cardsRes.json();
  const hasActive = myCards.some(c => c.is_active);

  document.getElementById('invite-no-card').classList.toggle('hidden', hasActive);
  document.getElementById('invite-has-card').classList.toggle('hidden', !hasActive);
  document.getElementById('invite-overlay').classList.remove('hidden');

  document.getElementById('btn-invite-join').onclick = () => {
    document.getElementById('invite-overlay').classList.add('hidden');
    history.replaceState(null, '', location.pathname);
    enterHub(hub);
  };
  document.getElementById('btn-invite-create-card').onclick = () => {
    document.getElementById('invite-overlay').classList.add('hidden');
    showScreen('cards');
    openEditor(null);
    pendingInviteHub = hub;
  };
}
document.getElementById('btn-invite-cancel').addEventListener('click', () => {
  document.getElementById('invite-overlay').classList.add('hidden');
  history.replaceState(null, '', location.pathname);
});

let pendingInviteHub = null;

function shareHubLink(hub) {
  const url = `${location.origin}${location.pathname}?hub=${hub.hub_id}`;
  if (navigator.share) {
    navigator.share({ title: `הצטרפו ל-${hub.name} ב-Hubble`, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => alert('הקישור הועתק! אפשר לשלוח אותו בכל אמצעי.'));
  } else {
    prompt('העתיקו את הקישור:', url);
  }
}

checkRegistration();
checkInviteLink();

// ---------------------------------------------------------------------------
// Unread badge + browser notifications for private messages — works
// anywhere in the app now, not only while physically inside a hub, since
// the socket connection stays alive across hub enter/leave (see
// leaveCurrentHub / on_connect on the server).
// ---------------------------------------------------------------------------

let unreadCount = 0;

function bumpUnread() {
  unreadCount += 1;
  updateUnreadBadges();
}

function clearUnread() {
  unreadCount = 0;
  updateUnreadBadges();
}

function updateUnreadBadges() {
  [document.getElementById('messages-unread-badge'), document.getElementById('private-unread-badge')].forEach(el => {
    if (!el) return;
    el.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    el.classList.toggle('hidden', unreadCount === 0);
  });
  document.getElementById('home-unread-dot').classList.toggle('hidden', unreadCount === 0);
}

function notifyNewMessage(fromName, text) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && !document.hidden) {
    // still show it even when the tab is focused, per the request — a
    // WhatsApp-style heads-up, not just a silent badge.
  }
  try {
    new Notification(`הודעה חדשה מ-${fromName}`, { body: text, icon: '/static/icons/icon-192.png' });
  } catch (e) { /* Notification constructor can fail on some mobile browsers — badge still works */ }
}

if ('Notification' in window && Notification.permission === 'default') {
  // ask once, quietly, on load — not blocking anything if declined
  Notification.requestPermission();
}

// ---------------------------------------------------------------------------
// Identity sync (link this browser/device to an existing person)
// ---------------------------------------------------------------------------

async function loadSyncCode() {
  const res = await fetch('/api/session');
  const data = await res.json();
  document.getElementById('my-sync-code').textContent = data.sync_code;
}

document.getElementById('btn-sync-link').addEventListener('click', async () => {
  const code = document.getElementById('sync-code-input').value.trim();
  if (!code) return;
  const res = await fetch('/api/session/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'שגיאה');
    return;
  }
  alert('חובר בהצלחה! טוען מחדש...');
  location.reload();
});

// ---------------------------------------------------------------------------
// My Messages
// ---------------------------------------------------------------------------

let convUnread = {};

async function loadMessages() {
  document.getElementById('messages-inbox-view').classList.remove('hidden');
  document.getElementById('messages-thread-view').classList.add('hidden');
  const res = await fetch('/api/messages');
  const conversations = await res.json();
  const list = document.getElementById('messages-list');
  if (conversations.length === 0) {
    list.innerHTML = '<div class="empty-state">עדיין אין שיחות פרטיות.</div>';
    return;
  }
  list.innerHTML = '';
  conversations.forEach(c => {
    const row = document.createElement('div');
    row.className = 'card-row' + (convUnread[c.user_id] ? ' conv-unread' : '');
    row.style.cursor = 'pointer';
    const badge = convUnread[c.user_id] ? `<span class="unread-badge">${convUnread[c.user_id]}</span>` : '';
    row.innerHTML = `
      <div class="card-row-info">
        <div class="card-row-name">${c.from_name} ${badge} ${c.is_green_now ? '<span class="presence-dot" style="color:#1a7f37">🟢 זמין</span>' : '<span class="hint" style="display:inline">לא זמין כרגע</span>'}</div>
        <div class="card-row-sub">${c.hub_name} · ${c.last_text || ''}</div>
      </div>`;
    row.addEventListener('click', () => openMessageThread(c));
    list.appendChild(row);
  });
}

let threadOtherUserId = null;
let threadOtherIsGreen = false;

async function openMessageThread(c) {
  threadOtherUserId = c.user_id;
  threadOtherIsGreen = c.is_green_now;
  delete convUnread[c.user_id];
  document.getElementById('messages-inbox-view').classList.add('hidden');
  document.getElementById('messages-thread-view').classList.remove('hidden');
  document.getElementById('thread-title').textContent = c.from_name;
  document.getElementById('thread-status').textContent = c.is_green_now
    ? '🟢 זמין/ה עכשיו לתקשורת' : 'לא מסומן/ת כזמין/ה כרגע — ההודעה תחכה עד שיתחברו';
  await renderThread();
}

async function renderThread() {
  const res = await fetch(`/api/messages/thread/${threadOtherUserId}`);
  const msgs = await res.json();
  const list = document.getElementById('thread-list');
  list.innerHTML = '';
  msgs.forEach(msg => {
    const el = document.createElement('div');
    el.className = 'msg';
    const imgHtml = msg.image ? `<img src="${msg.image}">` : '';
    el.innerHTML = `<div class="msg-bubble">
        <div class="msg-sender">${msg.mine ? 'אני' : ''}${msg.mine ? ' <button class="btn-icon btn-delete-msg" title="מחיקת ההודעה שלי">🗑</button>' : ''}</div>
        ${msg.text ? '<div class="msg-text"></div>' : ''}
        ${imgHtml}
      </div>`;
    if (msg.text) el.querySelector('.msg-text').textContent = msg.text;
    if (msg.mine) {
      el.querySelector('.btn-delete-msg').addEventListener('click', async () => {
        if (!confirm('למחוק את ההודעה?')) return;
        await fetch(`/api/messages/${msg.id}`, { method: 'DELETE' });
        renderThread();
      });
    }
    list.appendChild(el);
  });
  list.scrollTop = list.scrollHeight;
}

document.getElementById('btn-thread-back').addEventListener('click', () => {
  threadOtherUserId = null;
  loadMessages();
});

document.getElementById('form-thread-reply').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('thread-reply-input');
  const text = input.value.trim();
  if (!text || !threadOtherUserId) return;
  input.value = '';
  await fetch('/api/messages/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_user_id: threadOtherUserId, text }),
  });
  renderThread();
});

// ---------------------------------------------------------------------------
// Active card chip (shown in topbar on every screen)
// ---------------------------------------------------------------------------

async function refreshActiveCardChip() {
  const res = await fetch('/api/cards');
  const cards = await res.json();
  const active = cards.find(c => c.is_active);
  const chip = document.getElementById('active-card-chip');
  if (active) {
    const displayName = (active.name_visible && active.name) ? active.name
      : (active.nickname_visible && active.nickname) ? active.nickname
      : (active.name || active.nickname || '?');
    chip.textContent = `${displayName} · ${active.type === 'social' ? 'חברתי' : 'עסקי'}`;
  } else {
    chip.textContent = 'בחר כרטיס פעיל';
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Home: hub browser
// ---------------------------------------------------------------------------

let currentFilter = 'all';

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    loadHubs();
  });
});

async function loadHubs() {
  const res = await fetch(`/api/hubs?filter=${currentFilter}`);
  const hubs = await res.json();
  renderHubs(hubs);
}

function renderHubs(hubs) {
  const list = document.getElementById('hub-list');
  if (hubs.length === 0) {
    list.innerHTML = '<div class="empty-state">אין האבים כרגע בקטגוריה הזו.</div>';
    return;
  }
  list.innerHTML = '';
  hubs.forEach(hub => {
    const row = document.createElement('div');
    row.className = 'hub-row';
    row.innerHTML = `
      <div class="hub-row-info">
        <div class="hub-row-name">
          <span class="hub-tag ${hub.hub_type}">${hub.hub_type === 'social' ? 'חברתי' : hub.hub_type === 'business' ? 'עסקי' : 'מקצועי'}</span>
          ${hub.name}
          <span class="hub-serial">#${hub.serial || '----'}</span>
          ${!hub.is_published ? '<span class="hub-tag" style="background:rgba(232,163,61,.18);color:var(--gold)">📝 טיוטה</span>' : ''}
          ${hub.is_physical ? '<span class="presence-dot physical">📍 קרוב אליך</span>' : ''}
        </div>
        <div class="hub-row-meta">נפתח ע"י ${hub.owner_name || '—'} ${hub.description ? '· ' + hub.description : ''}</div>
      </div>
      <div class="hub-row-actions">
        <button class="btn-fav ${hub.is_favorite ? 'active' : ''}">★</button>
        <button class="btn btn-ghost btn-share-hub" title="שליחת קישור להאב">🔗 שיתוף</button>
        <button class="btn btn-primary btn-enter-hub">כניסה</button>
        ${hub.is_mine ? '<button class="btn btn-danger btn-close-hub">סגור</button>' : ''}
      </div>`;

    row.querySelector('.btn-fav').addEventListener('click', () => toggleFavorite(hub.hub_id));
    row.querySelector('.btn-share-hub').addEventListener('click', () => shareHubLink(hub));
    row.querySelector('.btn-enter-hub').addEventListener('click', () => enterHub(hub));
    if (hub.is_mine) {
      row.querySelector('.btn-close-hub').addEventListener('click', () => closeHub(hub.hub_id));
    }
    list.appendChild(row);
  });
}

// ---- hub search (by name or 4-digit serial) ----

let hubSearchDebounce = null;
document.getElementById('hub-search-input').addEventListener('input', e => {
  const q = e.target.value.trim();
  document.getElementById('btn-hub-search-clear').classList.toggle('hidden', !q);
  clearTimeout(hubSearchDebounce);
  hubSearchDebounce = setTimeout(async () => {
    if (!q) { loadHubs(); return; }
    const res = await fetch(`/api/hubs/search?q=${encodeURIComponent(q)}`);
    renderHubs(await res.json());
  }, 250);
});
document.getElementById('btn-hub-search-clear').addEventListener('click', () => {
  document.getElementById('hub-search-input').value = '';
  document.getElementById('btn-hub-search-clear').classList.add('hidden');
  loadHubs();
});

async function toggleFavorite(hubId) {
  await fetch(`/api/hubs/${hubId}/favorite`, { method: 'POST' });
  loadHubs();
}

async function closeHub(hubId) {
  if (!confirm('לסגור את ההאב לכל המשתמשים?')) return;
  await fetch(`/api/hubs/${hubId}/close`, { method: 'POST' });
  loadHubs();
}

// ---------------------------------------------------------------------------
// Open hub modal
// ---------------------------------------------------------------------------

const openHubOverlay = document.getElementById('open-hub-overlay');
const openHubForm = document.getElementById('form-open-hub');

document.getElementById('btn-open-hub').addEventListener('click', async () => {
  const cards = await refreshActiveCardChip();
  if (!cards.some(c => c.is_active)) {
    alert('צריך ליצור ולהפעיל כרטיס לפני פתיחת האב.');
    showScreen('cards');
    return;
  }
  document.getElementById('open-hub-error').classList.add('hidden');
  openHubForm.reset();
  document.getElementById('hub-name-row').classList.remove('hidden');
  document.getElementById('social-business-fields').classList.remove('hidden');
  document.getElementById('professional-hub-hint').classList.add('hidden');
  document.getElementById('btn-open-hub-submit').classList.remove('hidden');
  openHubOverlay.classList.remove('hidden');
});

openHubOverlay.querySelector('.btn-close-modal').addEventListener('click', () => {
  openHubOverlay.classList.add('hidden');
});

document.getElementById('open-hub-type-select').addEventListener('change', async e => {
  if (e.target.value !== 'professional') {
    document.getElementById('hub-name-row').classList.remove('hidden');
    document.getElementById('social-business-fields').classList.remove('hidden');
    document.getElementById('professional-hub-hint').classList.add('hidden');
    document.getElementById('btn-open-hub-submit').classList.remove('hidden');
    return;
  }
  // Professional: no name step here at all — create a draft immediately
  // with a placeholder name and jump straight into Conference Setup,
  // where the real name is the very first field (spec item 3).
  document.getElementById('hub-name-row').classList.add('hidden');
  document.getElementById('social-business-fields').classList.add('hidden');
  document.getElementById('professional-hub-hint').classList.remove('hidden');
  document.getElementById('btn-open-hub-submit').classList.add('hidden');

  const res = await fetch('/api/hubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'כנס חדש', hub_type: 'professional' }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errEl = document.getElementById('open-hub-error');
    errEl.textContent = data.error || 'שגיאה';
    errEl.classList.remove('hidden');
    return;
  }
  openHubOverlay.classList.add('hidden');
  openConferenceSetup(data.hub_id);
});

// ---- design template picker (5 pre-built templates, spec §4.2) — shared
// between the quick-create flow (legacy, no longer used for professional)
// and the full Conference Setup screen ----

const HUB_TEMPLATES = [
  { id: 'corporate_classic', name: 'קלאסי-ארגוני', colors: ['#185FA5', '#E6F1FB'] },
  { id: 'community_dynamic', name: 'טבעי-ירוק', colors: ['#0F6E56', '#9FE1CB'] },
  { id: 'creator_purple', name: 'יצירתי-סגול', colors: ['#534AB7', '#CECBF6'] },
  { id: 'minimalist_dark', name: 'תפעולי-כהה', colors: ['#12141f', '#E24B4A'] },
];

function renderTemplatePicker(containerId, hiddenInputId, selectedId) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  HUB_TEMPLATES.forEach(t => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'template-swatch' + (t.id === selectedId ? ' selected' : '');
    swatch.innerHTML = `
      <span class="template-swatch-colors">
        <span style="background:${t.colors[0]}"></span><span style="background:${t.colors[1]}"></span>
      </span>
      <span class="template-swatch-name">${t.name}</span>`;
    swatch.addEventListener('click', () => {
      document.getElementById(hiddenInputId).value = t.id;
      box.querySelectorAll('.template-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    box.appendChild(swatch);
  });
}

openHubForm.addEventListener('submit', async e => {
  e.preventDefault();
  const hubType = openHubForm.elements['hub_type'].value;
  if (hubType === 'professional') return; // handled entirely by the change listener above
  const name = openHubForm.elements['name'].value.trim();
  if (!name) return;

  const fd = new FormData(openHubForm);
  const payload = Object.fromEntries(fd.entries());
  const res = await fetch('/api/hubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const errEl = document.getElementById('open-hub-error');
    errEl.textContent = data.error || 'שגיאה';
    errEl.classList.remove('hidden');
    return;
  }
  openHubOverlay.classList.add('hidden');
  document.querySelector('.tab[data-filter="mine"]').click();
});

// ---------------------------------------------------------------------------
// Conference Setup screen — used both right after creating a professional
// hub (still a draft) and later for editing a published one (same screen,
// reachable via the "✏️ עריכת ההאב" button the owner sees on the hub page).
// ---------------------------------------------------------------------------

let csHubId = null;
let csBlocks = [];
let csLogoDataUrl = '';

async function openConferenceSetup(hubId) {
  csHubId = hubId;
  csLogoDataUrl = '';
  document.getElementById('cs-error').classList.add('hidden');

  const res = await fetch(`/api/hubs/${hubId}`);
  const hub = await res.json();

  document.getElementById('cs-name').value = hub.name || '';
  document.getElementById('cs-tagline').value = hub.tagline || '';
  document.getElementById('cs-tagline-visible').checked = hub.tagline_visible !== false;
  document.getElementById('cs-location').value = hub.location || '';
  document.getElementById('cs-location-visible').checked = hub.location_visible !== false;
  document.getElementById('cs-dates').value = hub.event_dates || '';
  document.getElementById('cs-dates-visible').checked = hub.event_dates_visible !== false;
  document.getElementById('cs-logo-visible').checked = hub.logo_visible !== false;
  const logoPreview = document.getElementById('cs-logo-preview');
  if (hub.logo_url) { logoPreview.src = hub.logo_url; logoPreview.classList.remove('hidden'); csLogoDataUrl = hub.logo_url; }
  else { logoPreview.classList.add('hidden'); }
  document.getElementById('cs-organizers').value = hub.organizer_names || '';
  document.getElementById('cs-organizers-visible').checked = hub.organizer_names_visible !== false;

  document.getElementById('cs-template-id').value = hub.template_id || 'corporate_classic';
  renderTemplatePicker('cs-template-picker', 'cs-template-id', hub.template_id || 'corporate_classic');

  const blocksRes = await fetch(`/api/hubs/${hubId}/blocks?all=true`);
  csBlocks = await blocksRes.json();
  renderCsBlocksList();

  document.getElementById('btn-cs-publish').classList.toggle('hidden', !!hub.is_published);
  document.getElementById('btn-cs-preview').textContent = hub.is_published ? 'צפייה בהאב 👁' : 'תצוגה מקדימה 👁';

  showScreen('conferenceSetup');
}

function csGatherPayload() {
  return {
    name: document.getElementById('cs-name').value.trim(),
    tagline: document.getElementById('cs-tagline').value.trim(),
    tagline_visible: document.getElementById('cs-tagline-visible').checked,
    location: document.getElementById('cs-location').value.trim(),
    location_visible: document.getElementById('cs-location-visible').checked,
    event_dates: document.getElementById('cs-dates').value.trim(),
    event_dates_visible: document.getElementById('cs-dates-visible').checked,
    logo_url: csLogoDataUrl,
    logo_visible: document.getElementById('cs-logo-visible').checked,
    organizer_names: document.getElementById('cs-organizers').value.trim(),
    organizer_names_visible: document.getElementById('cs-organizers-visible').checked,
    template_id: document.getElementById('cs-template-id').value,
  };
}

async function csSave() {
  const payload = csGatherPayload();
  if (!payload.name) {
    const errEl = document.getElementById('cs-error');
    errEl.textContent = 'יש להזין שם לכנס';
    errEl.classList.remove('hidden');
    return null;
  }
  const res = await fetch(`/api/hubs/${csHubId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok ? await res.json() : null;
}

document.getElementById('cs-logo-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    csLogoDataUrl = reader.result;
    const preview = document.getElementById('cs-logo-preview');
    preview.src = csLogoDataUrl;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-cs-save-draft').addEventListener('click', async () => {
  const hub = await csSave();
  if (hub) showScreen('home');
});

document.getElementById('btn-cs-preview').addEventListener('click', async () => {
  const hub = await csSave();
  if (!hub) return;
  const hubRow = { ...hub };
  enterHub(hubRow);
});

document.getElementById('btn-cs-publish').addEventListener('click', async () => {
  const hub = await csSave();
  if (!hub) return;
  const res = await fetch(`/api/hubs/${csHubId}/publish`, { method: 'POST' });
  if (res.ok) {
    const published = await res.json();
    enterHub(published);
  }
});

// ---- optional body fields (blocks): category picker → content editor ----

const CS_CATEGORIES = [
  { id: 'schedule', label: 'לוח הזמנים', icon: '🗓️' },
  { id: 'speakers', label: 'רשימת דוברים מרכזית', icon: '🎤' },
  { id: 'sponsors', label: 'ספונסרים', icon: '🤝' },
  { id: 'link', label: 'לינק לדף הכנס/תערוכה', icon: '🔗' },
  { id: 'contact', label: 'צור קשר עם המארגנים', icon: '✉️' },
  { id: 'events', label: 'רשימת אירועים', icon: '📅' },
  { id: 'map', label: 'מפה', icon: '🗺️' },
  { id: 'other', label: 'אחר', icon: '✏️' },
];

function renderCsBlocksList() {
  const box = document.getElementById('cs-blocks-list');
  box.innerHTML = csBlocks.length ? '' : '<p class="hint">עדיין לא נוספו שדות רשות.</p>';
  csBlocks.sort((a, b) => a.order - b.order).forEach(b => {
    const cat = CS_CATEGORIES.find(c => c.id === b.category) || CS_CATEGORIES[7];
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <div class="card-row-info" style="cursor:pointer">
        <div class="card-row-name">${cat.icon} ${b.title}${!b.is_visible ? ' <span class="hint" style="display:inline">(מוסתר)</span>' : ''}</div>
        <div class="card-row-sub">${b.display_mode === 'inline' ? 'מוצג קבוע בדף' : 'נפתח בלחיצה'}</div>
      </div>
      <button class="btn-icon btn-cs-block-up" title="הזז למעלה">⬆️</button>
      <button class="btn-icon btn-cs-block-down" title="הזז למטה">⬇️</button>`;
    row.querySelector('.card-row-info').addEventListener('click', () => openCsBlockEditor(b));
    row.querySelector('.btn-cs-block-up').addEventListener('click', () => csMoveBlock(b.id, 'up'));
    row.querySelector('.btn-cs-block-down').addEventListener('click', () => csMoveBlock(b.id, 'down'));
    box.appendChild(row);
  });
}

async function csMoveBlock(blockId, direction) {
  const res = await fetch(`/api/hubs/${csHubId}/blocks/${blockId}/move`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
  });
  csBlocks = await res.json();
  renderCsBlocksList();
}

document.getElementById('btn-cs-add-block').addEventListener('click', () => {
  const list = document.getElementById('cs-category-list');
  list.innerHTML = '';
  CS_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-option';
    btn.innerHTML = `<span class="category-icon">${cat.icon}</span><span>${cat.label}</span>`;
    btn.addEventListener('click', () => {
      document.getElementById('cs-category-overlay').classList.add('hidden');
      openCsBlockEditor(null, cat);
    });
    list.appendChild(btn);
  });
  document.getElementById('cs-category-overlay').classList.remove('hidden');
});

let csEditingBlock = null;
let csEditingCategory = null;
let csBlockImageDataUrl = '';

function openCsBlockEditor(block, category) {
  csEditingBlock = block;
  csEditingCategory = category || CS_CATEGORIES.find(c => c.id === (block && block.category)) || CS_CATEGORIES[7];
  csBlockImageDataUrl = block ? block.image_url || '' : '';

  const isOther = csEditingCategory.id === 'other';
  document.getElementById('cs-block-editor-title').textContent = block ? block.title : csEditingCategory.label;
  document.getElementById('cs-block-custom-title-row').classList.toggle('hidden', !isOther);
  document.getElementById('cs-block-custom-title').value = block ? block.title : '';
  document.getElementById('cs-block-content').value = block ? block.content : '';
  const imgPreview = document.getElementById('cs-block-image-preview');
  if (csBlockImageDataUrl) { imgPreview.src = csBlockImageDataUrl; imgPreview.classList.remove('hidden'); }
  else { imgPreview.classList.add('hidden'); }
  document.getElementById('cs-block-image-input').value = '';
  const displayMode = block ? block.display_mode : 'popup';
  document.querySelectorAll('input[name="cs-block-display"]').forEach(r => { r.checked = r.value === displayMode; });
  document.getElementById('btn-cs-block-delete').classList.toggle('hidden', !block);

  document.getElementById('cs-block-editor-overlay').classList.remove('hidden');
}

document.getElementById('cs-block-image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    csBlockImageDataUrl = reader.result;
    const preview = document.getElementById('cs-block-image-preview');
    preview.src = csBlockImageDataUrl;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-cs-block-save').addEventListener('click', async () => {
  const isOther = csEditingCategory.id === 'other';
  const title = isOther ? document.getElementById('cs-block-custom-title').value.trim() : csEditingCategory.label;
  if (!title) { alert('יש להזין כותרת'); return; }
  const displayMode = document.querySelector('input[name="cs-block-display"]:checked').value;
  const payload = {
    title, category: csEditingCategory.id,
    content: document.getElementById('cs-block-content').value.trim(),
    image_url: csBlockImageDataUrl,
    display_mode: displayMode,
  };
  if (csEditingBlock) {
    await fetch(`/api/hubs/${csHubId}/blocks/${csEditingBlock.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } else {
    await fetch(`/api/hubs/${csHubId}/blocks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  }
  const res = await fetch(`/api/hubs/${csHubId}/blocks?all=true`);
  csBlocks = await res.json();
  renderCsBlocksList();
  document.getElementById('cs-block-editor-overlay').classList.add('hidden');
});

document.getElementById('btn-cs-block-delete').addEventListener('click', async () => {
  if (!csEditingBlock) return;
  if (!confirm(`למחוק את "${csEditingBlock.title}"?`)) return;
  await fetch(`/api/hubs/${csHubId}/blocks/${csEditingBlock.id}`, { method: 'DELETE' });
  const res = await fetch(`/api/hubs/${csHubId}/blocks?all=true`);
  csBlocks = await res.json();
  renderCsBlocksList();
  document.getElementById('cs-block-editor-overlay').classList.add('hidden');
});

// ---------------------------------------------------------------------------
// My Contacts
// ---------------------------------------------------------------------------

let allGroups = [];
let allContacts = [];

async function loadContacts() {
  const res = await fetch('/api/contacts');
  allContacts = await res.json();
  renderContacts();
}

function renderContacts() {
  const list = document.getElementById('contacts-list');
  if (allContacts.length === 0) {
    list.innerHTML = '<div class="empty-state">עדיין אין אנשי קשר. הם יתמלאו כשמישהו ישלח לך כרטיס, או כששומרים כרטיס ישירות מרשימת הנוכחים בהאב.</div>';
    return;
  }
  list.innerHTML = '';
  allContacts.forEach(c => {
    const row = document.createElement('div');
    row.className = 'card-row';
    const groupOptions = ['<option value="">ללא קבוצה</option>']
      .concat(allGroups.map(g => `<option value="${g.id}" ${c.group_id === g.id ? 'selected' : ''}>${g.name}</option>`))
      .join('');
    row.innerHTML = `
      <div class="card-row-info" style="cursor:pointer">
        <div class="card-row-name">${c.card.name || c.card.nickname || '?'} ${c.is_green_now ? '<span class="presence-dot" style="color:var(--text-success,#1a7f37)">🟢 זמין עכשיו</span>' : ''}</div>
        <div class="card-row-sub">מהאב: ${c.hub_name || '—'}${c.note ? ' · ' + c.note : ''}</div>
      </div>
      <select class="contact-group-select">${groupOptions}</select>`;
    row.querySelector('.card-row-info').addEventListener('click', () => openSavedContact(c));
    row.querySelector('.contact-group-select').addEventListener('click', e => e.stopPropagation());
    row.querySelector('.contact-group-select').addEventListener('change', async e => {
      await fetch(`/api/contacts/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: e.target.value || null }),
      });
      c.group_id = e.target.value || null;
      loadGroups();
    });
    list.appendChild(row);
  });
}

// ---- contact groups ----

async function loadGroups() {
  const res = await fetch('/api/contact-groups');
  allGroups = await res.json();
  renderGroups();
}

function renderGroups() {
  const box = document.getElementById('groups-list');
  box.innerHTML = '';
  allGroups.forEach(g => {
    const chip = document.createElement('div');
    chip.className = 'group-chip';
    chip.innerHTML = `
      <span class="group-chip-name" style="cursor:pointer">${g.name} (${g.count})</span>
      <button class="btn-icon btn-group-where" title="איפה הם עכשיו">📍</button>
      <button class="btn-icon btn-group-message" title="הודעה לקבוצה">💬</button>
      <button class="btn-icon btn-group-delete" title="מחיקת קבוצה">✕</button>`;
    chip.querySelector('.group-chip-name').addEventListener('click', () => openGroupDetail(g));
    chip.querySelector('.btn-group-where').addEventListener('click', () => showGroupWhere(g));
    chip.querySelector('.btn-group-message').addEventListener('click', () => openGroupMessage(g));
    chip.querySelector('.btn-group-delete').addEventListener('click', async () => {
      if (!confirm(`למחוק את הקבוצה "${g.name}"? אנשי הקשר עצמם לא יימחקו.`)) return;
      await fetch(`/api/contact-groups/${g.id}`, { method: 'DELETE' });
      loadGroups();
      loadContacts();
    });
    box.appendChild(chip);
  });
}

// ---- group detail: view / add / remove members ----

let groupDetailTarget = null;

function openGroupDetail(g) {
  groupDetailTarget = g;
  document.getElementById('group-detail-title').textContent = g.name;
  renderGroupDetail();
  document.getElementById('group-detail-overlay').classList.remove('hidden');
}

function renderGroupDetail() {
  if (!groupDetailTarget) return;
  const members = allContacts.filter(c => c.group_id === groupDetailTarget.id);
  const others = allContacts.filter(c => c.group_id !== groupDetailTarget.id);

  const memberBox = document.getElementById('group-detail-members');
  memberBox.innerHTML = members.length ? '' : '<div class="empty-state">אין עדיין אנשי קשר בקבוצה הזו.</div>';
  members.forEach(c => {
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <div class="card-row-info">
        <div class="card-row-name">${c.card.name || c.card.nickname || '?'}</div>
      </div>
      <button class="btn btn-danger btn-small btn-remove-member">הסר</button>`;
    row.querySelector('.btn-remove-member').addEventListener('click', async () => {
      await fetch(`/api/contacts/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: null }),
      });
      c.group_id = null;
      renderGroupDetail();
      loadGroups();
    });
    memberBox.appendChild(row);
  });

  const addBox = document.getElementById('group-detail-add');
  addBox.innerHTML = others.length ? '' : '<div class="empty-state">כל אנשי הקשר שלך כבר בקבוצה הזו.</div>';
  others.forEach(c => {
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <div class="card-row-info">
        <div class="card-row-name">${c.card.name || c.card.nickname || '?'}</div>
        <div class="card-row-sub">${c.group_id ? 'בקבוצה אחרת' : 'ללא קבוצה'}</div>
      </div>
      <button class="btn btn-primary btn-small btn-add-member">הוסף</button>`;
    row.querySelector('.btn-add-member').addEventListener('click', async () => {
      await fetch(`/api/contacts/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupDetailTarget.id }),
      });
      c.group_id = groupDetailTarget.id;
      renderGroupDetail();
      loadGroups();
    });
    addBox.appendChild(row);
  });
}

document.getElementById('btn-new-group').addEventListener('click', async () => {
  const name = prompt('שם הקבוצה החדשה:');
  if (!name || !name.trim()) return;
  await fetch('/api/contact-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  loadGroups();
});

async function showGroupWhere(g) {
  const res = await fetch(`/api/contact-groups/${g.id}/where`);
  const results = await res.json();
  const body = document.getElementById('group-where-body');
  if (results.length === 0) {
    body.innerHTML = '<div class="empty-state">אף אחד מהקבוצה לא זמין (ירוק) כרגע באף האב.</div>';
  } else {
    body.innerHTML = results.map(r => `
      <div class="card-row"><div class="card-row-info">
        <div class="card-row-name">${r.name}</div>
        <div class="card-row-sub">נמצא/ת ב: ${r.hub_name}</div>
      </div></div>`).join('');
  }
  document.getElementById('group-where-overlay').classList.remove('hidden');
}

let messageGroupTarget = null;
function openGroupMessage(g) {
  messageGroupTarget = g;
  document.getElementById('group-message-title').textContent = `הודעה לקבוצה: ${g.name}`;
  document.getElementById('group-message-input').value = '';
  document.getElementById('group-message-overlay').classList.remove('hidden');
}
document.getElementById('btn-send-group-message').addEventListener('click', async () => {
  const text = document.getElementById('group-message-input').value.trim();
  if (!text || !messageGroupTarget) return;
  const res = await fetch(`/api/contact-groups/${messageGroupTarget.id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  document.getElementById('group-message-overlay').classList.add('hidden');
  if (res.ok) alert(`ההודעה נשלחה ל-${data.sent_to} אנשי קשר.`);
});

function openSavedContact(c) {
  document.getElementById('view-card-title').textContent = c.card.name || c.card.nickname || 'איש קשר';
  const body = document.getElementById('view-card-body');
  const rows = Object.entries(c.card)
    .filter(([f]) => FIELD_LABELS[f])
    .map(([f, v]) => [FIELD_LABELS[f], v]);
  if (c.hub_name) rows.unshift(['מהאב', c.hub_name]);
  if (c.note) rows.push(['ההערה שלי', c.note]);
  body.innerHTML = rows.map(([label]) => `<div class="view-field"><span>${label}</span><b></b></div>`).join('');
  body.querySelectorAll('.view-field b').forEach((el, i) => { el.textContent = rows[i][1]; });
  document.getElementById('view-card-actions').innerHTML = '';
  document.getElementById('view-card-overlay').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// My Cards (Phase 1 logic, adapted to the screen model)
// ---------------------------------------------------------------------------

let cards = [];
let editingCardId = null;
let selectedType = null;
let photoDataUrl = "";

const overlay = document.getElementById('editor-overlay');
const form = document.getElementById('card-form');
const typePicker = document.getElementById('type-picker');

async function loadCards() {
  const res = await fetch('/api/cards');
  cards = await res.json();
  renderCards();
  refreshActiveCardChip();
}

function renderCards() {
  const list = document.getElementById('card-list');
  if (cards.length === 0) {
    list.innerHTML = '<div class="empty-state">אין עדיין כרטיסים. צור כרטיס ראשון כדי להתחיל.</div>';
    return;
  }
  list.innerHTML = '';
  cards.forEach(card => {
    const row = document.createElement('div');
    row.className = 'card-row' + (card.is_active ? ' active' : '');
    const displayName = (card.name_visible && card.name) ? card.name
      : (card.nickname_visible && card.nickname) ? card.nickname
      : (card.name || card.nickname || '?');
    const initial = displayName[0]?.toUpperCase() || '?';
    const sub = card.type === 'social'
      ? [card.status, card.mood].filter(Boolean).join(' · ')
      : [card.title, card.company].filter(Boolean).join(' @ ');

    row.innerHTML = `
      <div class="card-avatar ${card.type}">${card.photo_url ? `<img src="${card.photo_url}">` : initial}</div>
      <div class="card-row-info">
        <div class="card-row-name">${displayName} ${card.is_active ? '<span class="badge-active">פעיל</span>' : ''}</div>
        <div class="card-row-sub">${card.type === 'social' ? 'חברתי' : 'עסקי'}${sub ? ' · ' + sub : ''}</div>
      </div>
      <div class="card-row-actions">
        ${card.is_active ? '' : '<button class="btn btn-ghost btn-activate">הפוך לפעיל</button>'}
        <button class="btn btn-ghost btn-edit">ערוך</button>
        <button class="btn btn-danger btn-delete">מחק</button>
      </div>`;

    if (!card.is_active) {
      row.querySelector('.btn-activate').addEventListener('click', () => activateCard(card.id));
    }
    row.querySelector('.btn-edit').addEventListener('click', () => openEditor(card));
    row.querySelector('.btn-delete').addEventListener('click', () => deleteCard(card.id));
    list.appendChild(row);
  });
}

async function activateCard(id) {
  await fetch(`/api/cards/${id}/activate`, { method: 'POST' });
  loadCards();
}

async function deleteCard(id) {
  if (!confirm('למחוק את הכרטיס?')) return;
  await fetch(`/api/cards/${id}`, { method: 'DELETE' });
  loadCards();
}

document.getElementById('btn-new-card').addEventListener('click', () => openEditor(null));
document.getElementById('btn-close-editor').addEventListener('click', closeEditor);

function openEditor(card) {
  editingCardId = card ? card.id : null;
  pendingNewCardPhotos = [];
  document.getElementById('editor-title').textContent = card ? 'עריכת כרטיס' : 'כרטיס חדש';
  document.getElementById('form-error').classList.add('hidden');
  form.reset();

  if (card) {
    selectType(card.type);
    typePicker.classList.add('hidden');
    Object.keys(card).forEach(key => {
      const el = form.elements[key];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!card[key];
      else el.value = card[key] || '';
    });
    renderPhotoGallery(card.photos || []);
  } else {
    selectedType = null;
    typePicker.classList.remove('hidden');
    form.classList.add('hidden');
    renderPhotoGallery([]);
  }
  overlay.classList.remove('hidden');
}

function closeEditor() {
  overlay.classList.add('hidden');
}

typePicker.querySelectorAll('.type-option').forEach(btn => {
  btn.addEventListener('click', () => {
    selectType(btn.dataset.type);
    typePicker.classList.add('hidden');
  });
});

function selectType(type) {
  selectedType = type;
  form.classList.remove('hidden');
  document.getElementById('business-fields').classList.toggle('hidden', type !== 'business');
  document.getElementById('social-fields').classList.toggle('hidden', type !== 'social');
}

// ---- photo gallery (multiple photos per card, each independently shown/hidden) ----

function renderPhotoGallery(photos) {
  const box = document.getElementById('photo-gallery');
  box.innerHTML = '';
  photos.forEach(p => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.dataset.photoId = p.id || '';
    item.innerHTML = `
      <img src="${p.url}">
      <label class="vis-toggle"><input type="checkbox" ${p.is_visible ? 'checked' : ''} class="photo-visible-toggle"> הצג בפרופיל</label>
      <button type="button" class="btn btn-danger btn-small btn-delete-photo">🗑 מחק</button>`;
    item.querySelector('.photo-visible-toggle').addEventListener('change', async e => {
      if (!editingCardId) return; // new unsaved card — nothing to toggle server-side yet
      await fetch(`/api/cards/${editingCardId}/photos/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_visible: e.target.checked }),
      });
    });
    item.querySelector('.btn-delete-photo').addEventListener('click', async () => {
      if (editingCardId) {
        await fetch(`/api/cards/${editingCardId}/photos/${p.id}`, { method: 'DELETE' });
      }
      item.remove();
    });
    box.appendChild(item);
  });
}

document.getElementById('photo-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    if (editingCardId) {
      // existing card — upload straight away so it's saved even if the editor is closed without hitting save
      const res = await fetch(`/api/cards/${editingCardId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: dataUrl }),
      });
      const photo = await res.json();
      const box = document.getElementById('photo-gallery');
      const current = Array.from(box.children).length; // just re-render by appending
      renderPhotoGallery([...photosFromGallery(), photo]);
    } else {
      // brand-new card not saved yet — stash locally, upload right after creation
      pendingNewCardPhotos.push(dataUrl);
      renderPhotoGallery(photosFromGallery().concat([{ id: null, url: dataUrl, is_visible: true }]));
    }
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // allow selecting the same file again
});

function photosFromGallery() {
  // reconstruct current gallery state from the DOM (simple approach, avoids extra state var)
  return Array.from(document.getElementById('photo-gallery').children).map(item => ({
    id: item.dataset.photoId || null,
    url: item.querySelector('img').src,
    is_visible: item.querySelector('.photo-visible-toggle').checked,
  }));
}

let pendingNewCardPhotos = [];

form.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(form);
  const payload = { type: selectedType };
  for (const [k, v] of fd.entries()) {
    const el = form.elements[k];
    payload[k] = el.type === 'checkbox' ? true : v;
  }
  form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (!(cb.name in payload)) payload[cb.name] = false;
  });

  const url = editingCardId ? `/api/cards/${editingCardId}` : '/api/cards';
  const method = editingCardId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const errEl = document.getElementById('form-error');
    errEl.textContent = data.error || 'שגיאה';
    errEl.classList.remove('hidden');
    return;
  }
  if (!editingCardId && pendingNewCardPhotos.length) {
    // brand-new card — now that it has an id, upload the photos staged during editing
    for (const url of pendingNewCardPhotos) {
      await fetch(`/api/cards/${data.id}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    }
    pendingNewCardPhotos = [];
  }
  closeEditor();
  if (pendingInviteHub) {
    if (!data.is_active) await fetch(`/api/cards/${data.id}/activate`, { method: 'POST' });
    const hub = pendingInviteHub;
    pendingInviteHub = null;
    history.replaceState(null, '', location.pathname);
    loadCards();
    enterHub(hub);
  } else {
    loadCards();
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadCards();
loadHubs();

// ---------------------------------------------------------------------------
// Phase 3: inside a hub
// ---------------------------------------------------------------------------

let socket = null;
let myUserId = null;
let currentHubId = null;
let currentHubType = null;
let currentPresence = [];      // last presence_list payload
let privateTargetUserId = null;
let privateThreads = {};       // user_id -> [messages]
let pendingContactOffer = null;

function ensureSocket() {
  if (socket && socket.connected) return socket;
  socket = io({ transports: ['websocket'] });

  socket.on('hub_state', data => {
    myUserId = data.my_user_id;
    isHubOwner = !!data.hub.is_mine;
    currentHubType = data.hub.hub_type;
    document.getElementById('btn-owner-controls').classList.toggle('hidden', !isHubOwner);
    document.getElementById('hub-title').textContent = data.hub.name;
    document.getElementById('board-list').innerHTML = '';
    data.board.forEach(renderBoardMessage);
    applyHubBackground(data.hub.background_image_url, data.hub.background_music_url);
    renderConferenceBanner(data.hub);
    document.getElementById('owner-pending-section').classList.toggle('hidden', !(isHubOwner && data.hub.hub_type === 'professional'));

    // restore this hub's private conversations (survives leaving & rejoining)
    privateThreads = data.private_history || {};
  });

  function renderConferenceBanner(hub) {
    const isProfessional = hub.hub_type === 'professional';
    document.getElementById('conference-banner').classList.toggle('hidden', !isProfessional);
    document.getElementById('hub-view-toggle').classList.toggle('hidden', !isProfessional);
    document.getElementById('hub-data-view').classList.toggle('hidden', !isProfessional);
    document.getElementById('btn-hub-report').classList.toggle('hidden', !isProfessional);
    document.getElementById('owner-blocks-editor').classList.toggle('hidden', !isHubOwner);
    document.getElementById('owner-broadcast-section').classList.toggle('hidden', !(isHubOwner && isProfessional));

    const screenHub = document.getElementById('screen-hub');
    HUB_TEMPLATES.forEach(t => screenHub.classList.remove('tpl-' + t.id));
    if (isProfessional) screenHub.classList.add('tpl-' + (hub.template_id || 'corporate_classic'));

    if (!isProfessional) return;

    const logo = document.getElementById('conference-logo');
    logo.classList.toggle('hidden', !(hub.logo_url && hub.logo_visible !== false));
    if (hub.logo_url) logo.src = hub.logo_url;
    document.getElementById('conference-tagline').textContent =
      (hub.tagline_visible !== false && hub.tagline) ? hub.tagline : hub.name;
    const metaParts = [];
    if (hub.location_visible !== false && hub.location) metaParts.push(hub.location);
    if (hub.event_dates_visible !== false && hub.event_dates) metaParts.push(hub.event_dates);
    if (!hub.is_published) metaParts.unshift('📝 טיוטה — עדיין לא פורסם');
    document.getElementById('conference-meta').textContent = metaParts.join(' · ');

    const footer = document.getElementById('hub-organizer-footer');
    if (hub.organizer_names_visible !== false && hub.organizer_names) {
      footer.textContent = `מארגנים: ${hub.organizer_names}`;
      footer.classList.remove('hidden');
    } else {
      footer.classList.add('hidden');
    }

    loadProgramBlocks(); // always-present data section now, not a lazily-opened tab

    document.getElementById('owner-publish-row').classList.toggle('hidden', hub.is_published || !isHubOwner);
  }

  function renderDirectoryList(rows) {
    const box = document.getElementById('directory-list');
    box.innerHTML = '';
    rows.forEach(p => {
      const row = document.createElement('div');
      row.className = 'card-row' + (p.is_owner ? ' is-owner' : '');
      row.innerHTML = `
        <div class="card-row-info">
          <div class="card-row-name">${p.display_name}${p.is_owner ? ' 👑' : ''} ${p.is_live ? '<span class="presence-dot" style="color:#1a7f37">🟢</span>' : '<span class="hint" style="display:inline">לא מחובר/ת כרגע</span>'}</div>
          <div class="card-row-sub">${p.card.title || ''} ${p.card.company ? '· ' + p.card.company : ''}</div>
        </div>`;
      row.addEventListener('click', () => openParticipantCard(p));
      box.appendChild(row);
    });
  }

  function renderPendingApprovals(rows) {
    const box = document.getElementById('owner-pending-list');
    const badge = document.getElementById('pending-count-badge');
    badge.textContent = rows.length;
    badge.classList.toggle('hidden', rows.length === 0);
    box.innerHTML = rows.length ? '' : '<div class="empty-state">אין הרשמות ממתינות כרגע.</div>';
    rows.forEach(p => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.innerHTML = `
        <div class="card-row-info">
          <div class="card-row-name">${p.display_name}</div>
          <div class="card-row-sub">${p.card.title || ''} ${p.card.company ? '· ' + p.card.company : ''}</div>
        </div>
        <button class="btn btn-primary btn-small btn-approve">אשר</button>
        <button class="btn btn-danger btn-small btn-reject">דחה</button>`;
      row.querySelector('.btn-approve').addEventListener('click', () => {
        socket.emit('owner_approve_attendee', { hub_id: currentHubId, user_id: p.user_id });
      });
      row.querySelector('.btn-reject').addEventListener('click', () => {
        if (confirm(`לדחות את ${p.display_name}?`)) {
          socket.emit('owner_reject_attendee', { hub_id: currentHubId, user_id: p.user_id });
        }
      });
      box.appendChild(row);
    });
  }

  function renderProgramBlocks(blocks) {
    const list = document.getElementById('program-list');
    list.innerHTML = blocks.length ? '' : '<div class="empty-state">אין עדיין תוכן בתוכנית הכנס.</div>';
    blocks.forEach((b, idx) => {
      const item = document.createElement('div');
      item.className = 'card-row';
      const ownerControls = isHubOwner ? `
          <div class="block-owner-controls">
            <label class="vis-toggle"><input type="checkbox" class="block-visible-toggle" ${b.is_visible ? 'checked' : ''}> מוצג</label>
            <button class="btn-icon btn-block-up" title="הזז למעלה">⬆️</button>
            <button class="btn-icon btn-block-down" title="הזז למטה">⬇️</button>
            <button class="btn-icon btn-block-delete" title="מחק">🗑</button>
          </div>` : '';
      item.innerHTML = `
        <div class="card-row-info">
          <div class="card-row-name">${b.title}${!b.is_visible ? ' <span class="hint" style="display:inline">(מוסתר)</span>' : ''}</div>
          <div class="card-row-sub" style="white-space:pre-wrap">${b.content}</div>
          ${ownerControls}
        </div>`;
      if (isHubOwner) {
        item.querySelector('.block-visible-toggle').addEventListener('change', async e => {
          await fetch(`/api/hubs/${currentHubId}/blocks/${b.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_visible: e.target.checked }),
          });
          loadProgramBlocks();
        });
        item.querySelector('.btn-block-up').addEventListener('click', async () => {
          await fetch(`/api/hubs/${currentHubId}/blocks/${b.id}/move`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: 'up' }),
          });
          loadProgramBlocks();
        });
        item.querySelector('.btn-block-down').addEventListener('click', async () => {
          await fetch(`/api/hubs/${currentHubId}/blocks/${b.id}/move`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: 'down' }),
          });
          loadProgramBlocks();
        });
        item.querySelector('.btn-block-delete').addEventListener('click', async () => {
          if (!confirm(`למחוק את "${b.title}"?`)) return;
          await fetch(`/api/hubs/${currentHubId}/blocks/${b.id}`, { method: 'DELETE' });
          loadProgramBlocks();
        });
      }
      list.appendChild(item);
    });
  }

  async function loadProgramBlocks() {
    if (!currentHubId) return;
    const res = await fetch(`/api/hubs/${currentHubId}/blocks`);
    renderProgramBlocks(await res.json());
  }

  document.getElementById('btn-add-block').addEventListener('click', async () => {
    const title = document.getElementById('new-block-title').value.trim();
    const content = document.getElementById('new-block-content').value.trim();
    if (!title) { alert('יש להזין כותרת'); return; }
    await fetch(`/api/hubs/${currentHubId}/blocks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    document.getElementById('new-block-title').value = '';
    document.getElementById('new-block-content').value = '';
    loadProgramBlocks();
  });

  document.getElementById('btn-open-broadcast').addEventListener('click', () => {
    document.getElementById('broadcast-text').value = '';
    document.getElementById('broadcast-overlay').classList.remove('hidden');
  });
  document.getElementById('btn-send-broadcast').addEventListener('click', async () => {
    const text = document.getElementById('broadcast-text').value.trim();
    const target = document.getElementById('broadcast-target').value;
    if (!text) return;
    const res = await fetch(`/api/hubs/${currentHubId}/broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target }),
    });
    const data = await res.json();
    document.getElementById('broadcast-overlay').classList.add('hidden');
    if (res.ok) alert(`השידור נשלח ל-${data.sent_to} נרשמים.`);
  });

  socket.on('hub_background_updated', data => {
    applyHubBackground(data.background_image_url, data.background_music_url);
  });

  socket.on('presence_list', data => {
    currentPresence = data;
    renderParticipants(data);
    const me = data.find(p => p.user_id === myUserId);
    if (me) {
      const boardForm = document.getElementById('form-board-send');
      boardForm.querySelectorAll('input, button').forEach(el => el.disabled = me.is_blocked);
      boardForm.querySelector('#board-text-input').placeholder = me.is_blocked
        ? 'בעל ההאב חסם אותך מפרסום ללוח הכללי'
        : 'שתפו את כל ההאב...';
    }
    if (!document.getElementById('owner-controls-overlay').classList.contains('hidden')) {
      renderOwnerParticipantList();
    }
  });

  socket.on('board_message', renderBoardMessage);

  socket.on('board_message_deleted', ({ id }) => {
    const el = document.querySelector(`#board-list .msg[data-msg-id="${id}"]`);
    if (el) el.remove();
  });

  socket.on('private_message', msg => {
    const otherId = msg.from_user_id === myUserId ? msg.to_user_id : msg.from_user_id;

    // In-hub private panel shows ONLY messages tied to the hub currently
    // open (spec item 8) — messages from other hubs (or hub-less replies /
    // group broadcasts) never leak into it, even though this socket stays
    // connected app-wide for notifications.
    if (msg.hub_id && msg.hub_id === currentHubId) {
      privateThreads[otherId] = privateThreads[otherId] || [];
      privateThreads[otherId].push(msg);
      if (privateTargetUserId === otherId) renderPrivateThread(otherId);
    }

    if (msg.from_user_id !== myUserId) {
      const viewingThisThread =
        (privateTargetUserId === otherId && msg.hub_id === currentHubId && !document.getElementById('screen-hub').classList.contains('hidden')) ||
        (threadOtherUserId === otherId && !document.getElementById('screen-messages').classList.contains('hidden'));
      if (!viewingThisThread) {
        bumpUnread();
        convUnread[otherId] = (convUnread[otherId] || 0) + 1;
        if (!document.getElementById('screen-messages').classList.contains('hidden') &&
            !document.getElementById('messages-inbox-view').classList.contains('hidden')) {
          loadMessages(); // live-refresh the inbox badge if it's on screen
        }
        notifyNewMessage(msg.from_name, msg.text || 'שלח/ה לך תמונה');
      }
    }
  });

  socket.on('private_message_deleted', ({ id, other_user_id }) => {
    if (privateThreads[other_user_id]) {
      privateThreads[other_user_id] = privateThreads[other_user_id].filter(m => m.id !== id);
      if (privateTargetUserId === other_user_id) renderPrivateThread(other_user_id);
    }
  });

  socket.on('contact_offer', offer => {
    pendingContactOffer = offer;
    showContactOffer(offer);
  });

  socket.on('hub_pending', ({ hub }) => {
    document.getElementById('pending-hub-name').textContent = hub.name;
    document.getElementById('pending-approval-overlay').classList.remove('hidden');
    showScreen('home');
  });

  socket.on('registration_approved', ({ hub_id }) => {
    document.getElementById('pending-approval-overlay').classList.add('hidden');
    alert('אושרת! נכנסים לכנס...');
    socket.emit('join_hub', { hub_id });
  });

  socket.on('registration_rejected', () => {
    document.getElementById('pending-approval-overlay').classList.add('hidden');
    alert('הארגונאי לא אישר את ההרשמה שלך להאב הזה.');
    showScreen('home');
  });

  socket.on('directory_list', renderDirectoryList);

  socket.on('pending_list', renderPendingApprovals);

  socket.on('blocks_updated', ({ hub_id }) => {
    if (hub_id === currentHubId) loadProgramBlocks();
  });

  socket.on('error_msg', data => {
    if (data.error === 'hub_requires_business_card') {
      if (confirm(`${data.message}\n\nלעבור למסך הכרטיסים עכשיו?`)) {
        showScreen('cards');
      }
      return;
    }
    alert(data.message || data.error);
  });

  socket.on('hub_closed', () => {
    alert('בעל ההאב סגר את ההאב.');
    showScreen('home');
  });

  return socket;
}

function enterHub(hub) {
  currentHubId = hub.hub_id;
  privateThreads = {};
  privateTargetUserId = null;
  document.getElementById('participant-list').innerHTML = '';
  document.getElementById('board-list').innerHTML = '';
  document.getElementById('private-list').innerHTML = '';
  document.getElementById('private-target-bar').textContent = 'בחרו איש קשר ירוק מהרשימה כדי לשלוח הודעה פרטית';
  document.getElementById('form-private-send').classList.add('hidden');
  document.querySelector('.chat-tab[data-tab="board"]').click();

  showScreen('hub');
  ensureSocket();
  socket.emit('join_hub', { hub_id: hub.hub_id });
}

function leaveCurrentHub() {
  // Leave the hub's room, but keep the socket connection itself alive so
  // this person can still be notified of new private messages anywhere
  // else in the app (My Contacts, My Messages, home screen...).
  if (socket && currentHubId) {
    socket.emit('leave_hub', {});
  }
  currentHubId = null;
  const audio = document.getElementById('hub-music');
  audio.pause();
  audio.src = '';
  document.getElementById('screen-hub').style.backgroundImage = '';
}

// ---- presence list ----

function renderParticipants(presence) {
  const list = document.getElementById('participant-list');
  document.getElementById('participant-count').textContent = presence.length;
  list.innerHTML = '';
  // Server sorts owner first; client bumps "me" to the top too — right
  // after the owner if the owner is someone else and present, or to the
  // very top otherwise (spec item 7).
  const sorted = [...presence].sort((a, b) => {
    const aMe = a.user_id === myUserId, bMe = b.user_id === myUserId;
    if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1;
    if (aMe !== bMe) return aMe ? -1 : 1;
    return 0;
  });
  sorted.forEach(p => {
    const row = document.createElement('div');
    row.className = 'participant-row' + (p.is_owner ? ' is-owner' : '');
    const initial = (p.display_name || '?')[0].toUpperCase();
    const sub = p.card.type === 'social'
      ? [p.card.status, p.card.mood].filter(Boolean).join(' · ')
      : [p.card.title, p.card.company].filter(Boolean).join(' @ ');
    row.innerHTML = `
      <span class="presence-status ${p.status}" title="${p.user_id === myUserId ? 'הקשה כדי לשנות זמינות' : ''}"></span>
      <div class="avatar ${p.card.type}">${p.card.photo_url ? `<img src="${p.card.photo_url}">` : initial}</div>
      <div class="participant-info">
        <div class="participant-name">${p.display_name}${p.user_id === myUserId ? ' (אני)' : ''}</div>
        <div class="participant-sub">${sub || (p.card.type === 'social' ? 'חברתי' : 'עסקי')} · ${p.is_physical ? '📍 פיזי' : '🌐 מרוחק'}</div>
      </div>`;
    if (p.user_id === myUserId) {
      row.style.cursor = 'pointer';
      row.querySelector('.presence-status').style.cursor = 'pointer';
      row.querySelector('.presence-status').addEventListener('click', e => {
        e.stopPropagation();
        socket && socket.emit('set_status', { status: p.status === 'green' ? 'red' : 'green' });
      });
      row.addEventListener('click', async () => {
        const res = await fetch('/api/cards');
        const cards = await res.json();
        const active = cards.find(c => c.is_active);
        if (active) { showScreen('cards'); openEditor(active); }
      });
    } else {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openParticipantCard(p));
    }
    list.appendChild(row);
  });
}

document.getElementById('btn-hub-report').addEventListener('click', () => {
  document.getElementById('report-options-overlay').classList.remove('hidden');
});

document.getElementById('btn-generate-report').addEventListener('click', async () => {
  const modules = document.getElementById('report-include-modules').checked;
  const directory = document.getElementById('report-include-directory').checked;
  const contacts = document.getElementById('report-include-contacts').checked;
  const res = await fetch(`/api/hubs/${currentHubId}/report?modules=${modules}&directory=${directory}&contacts=${contacts}`);
  const report = await res.json();
  document.getElementById('report-options-overlay').classList.add('hidden');
  renderReport(report);
  document.getElementById('report-view-overlay').classList.remove('hidden');
});

function renderReport(report) {
  const hub = report.hub;
  const parts = [];
  parts.push(`
    <div class="report-block">
      <h3>${hub.name}</h3>
      <div class="report-row">${hub.tagline || ''}</div>
      <div class="report-row">${[hub.location, hub.event_dates].filter(Boolean).join(' · ')}</div>
      <div class="report-row hint">נוצר ב-${new Date(report.generated_at * 1000).toLocaleString('he-IL')}</div>
    </div>`);

  if (report.modules) {
    parts.push(`<div class="report-block"><h3>תוכנית הכנס</h3>${
      report.modules.map(m => `<div class="report-row"><b>${m.title}</b><br>${m.content}</div>`).join('') || '<div class="report-row hint">אין תוכן.</div>'
    }</div>`);
  }
  if (report.directory) {
    parts.push(`<div class="report-block"><h3>ספריית נרשמים (${report.directory.length})</h3>${
      report.directory.map(p => `<div class="report-row">${p.display_name}${p.is_owner ? ' 👑' : ''} — ${p.card.title || ''} ${p.card.company ? '· ' + p.card.company : ''}</div>`).join('')
    }</div>`);
  }
  if (report.my_contacts) {
    parts.push(`<div class="report-block"><h3>אנשי הקשר שלי מכאן (${report.my_contacts.length})</h3>${
      report.my_contacts.map(c => `<div class="report-row">${c.card.name || c.card.nickname || '?'} ${c.note ? '— ' + c.note : ''}</div>`).join('') || '<div class="report-row hint">עדיין לא שמרת אף אחד.</div>'
    }</div>`);
  }
  document.getElementById('report-content').innerHTML = parts.join('');
}

document.getElementById('btn-print-report').addEventListener('click', () => window.print());

document.getElementById('btn-publish-hub').addEventListener('click', async () => {
  if (!confirm('לפרסם את הכנס? מרגע זה כל אחד יוכל למצוא ולהצטרף להאב.')) return;
  const res = await fetch(`/api/hubs/${currentHubId}/publish`, { method: 'POST' });
  if (res.ok) {
    document.getElementById('owner-publish-row').classList.add('hidden');
    const meta = document.getElementById('conference-meta');
    meta.textContent = meta.textContent.replace('📝 טיוטה — עדיין לא פורסם · ', '').replace('📝 טיוטה — עדיין לא פורסם', '');
  }
});

// ---- board ----

document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('board-panel').classList.toggle('hidden', tab.dataset.tab !== 'board');
    document.getElementById('private-panel').classList.toggle('hidden', tab.dataset.tab !== 'private');
    if (tab.dataset.tab === 'private') clearUnread();
  });
});

document.querySelectorAll('.hub-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hub-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.view === 'data'
      ? document.getElementById('hub-data-view')
      : document.getElementById('hub-communication-view');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

function renderBoardMessage(msg) {
  const el = document.createElement('div');
  el.className = 'msg' + (msg.is_owner ? ' msg-owner' : '');
  el.dataset.msgId = msg.id;
  const imgHtml = msg.image ? `<img src="${msg.image}">` : '';
  const mine = msg.sender_user_id === myUserId;
  el.innerHTML = `<div class="msg-bubble">
      <div class="msg-sender ${msg.sender_type}${msg.is_owner ? ' owner-tag' : ''}">${msg.sender_name}${mine ? ' <button class="btn-icon btn-delete-msg" title="מחיקת ההודעה שלי">🗑</button>' : ''}</div>
      ${msg.text ? '<div class="msg-text"></div>' : ''}
      ${imgHtml}
    </div>`;
  if (msg.text) el.querySelector('.msg-text').textContent = msg.text;
  if (mine) {
    el.querySelector('.btn-delete-msg').addEventListener('click', () => {
      if (!confirm('למחוק את ההודעה?')) return;
      socket.emit('delete_board_message', { message_id: msg.id });
    });
  }
  const list = document.getElementById('board-list');
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
}

document.getElementById('form-board-send').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('board-text-input');
  const text = input.value.trim();
  if (!text || !socket) return;
  socket.emit('send_board_message', { text });
  input.value = '';
});

document.getElementById('board-image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !socket) return;
  const reader = new FileReader();
  reader.onload = () => socket.emit('send_board_message', { text: '', image: reader.result });
  reader.readAsDataURL(file);
  e.target.value = '';
});

// ---- private messages ----

function openParticipantCard(p) {
  document.getElementById('view-card-title').textContent = p.display_name;
  const body = document.getElementById('view-card-body');
  const c = p.card;
  const rows = [];
  if (c.type === 'business') {
    if (c.title) rows.push(['תפקיד', c.title]);
    if (c.company) rows.push(['חברה', c.company]);
  } else {
    if (c.status) rows.push(['סטטוס', c.status]);
    if (c.mood) rows.push(['מצב רוח', c.mood]);
    if (c.bio) rows.push(['ביו', c.bio]);
  }
  if (c.phone) rows.push(['טלפון', c.phone]);
  if (c.email) rows.push(['מייל', c.email]);
  if (c.instagram) rows.push(['אינסטגרם', c.instagram]);
  if (c.tiktok) rows.push(['טיקטוק', c.tiktok]);
  body.innerHTML = rows.map(([label, val]) => `<div class="view-field"><span>${label}</span><b></b></div>`).join('')
    || '<div class="empty-state">האדם הזה לא חשף פרטים נוספים.</div>';
  body.querySelectorAll('.view-field b').forEach((el, i) => { el.textContent = rows[i][1]; });

  const actions = document.getElementById('view-card-actions');
  actions.innerHTML = '';
  if (p.status === 'green') {
    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn btn-primary';
    msgBtn.textContent = '💬 הודעה פרטית';
    msgBtn.addEventListener('click', () => {
      document.getElementById('view-card-overlay').classList.add('hidden');
      document.querySelector('.chat-tab[data-tab="private"]').click();
      selectPrivateTarget(p);
    });
    actions.appendChild(msgBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-ghost';
    saveBtn.textContent = '💾 שמירה באנשי הקשר';
    saveBtn.addEventListener('click', async () => {
      const res = await fetch('/api/contacts/save-visible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub_id: currentHubId, from_user_id: p.user_id }),
      });
      if (res.ok) {
        alert('נשמר באנשי הקשר שלך.');
        document.getElementById('view-card-overlay').classList.add('hidden');
      } else {
        const data = await res.json();
        alert(data.error || 'שגיאה בשמירה');
      }
    });
    actions.appendChild(saveBtn);
  }
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn btn-ghost';
  shareBtn.textContent = '📇 שליחת פרטי קשר';
  shareBtn.addEventListener('click', () => {
    document.getElementById('view-card-overlay').classList.add('hidden');
    openShareContact(p);
  });
  actions.appendChild(shareBtn);

  document.getElementById('view-card-overlay').classList.remove('hidden');
}

function selectPrivateTarget(p) {
  privateTargetUserId = p.user_id;
  document.getElementById('private-target-bar').textContent = `שיחה עם ${p.display_name}`;
  document.getElementById('form-private-send').classList.remove('hidden');
  renderPrivateThread(p.user_id);
}

function renderPrivateThread(userId) {
  const list = document.getElementById('private-list');
  list.innerHTML = '';
  (privateThreads[userId] || []).forEach(msg => {
    const el = document.createElement('div');
    el.className = 'msg';
    el.dataset.msgId = msg.id || '';
    const mine = msg.from_user_id === myUserId;
    const imgHtml = msg.image ? `<img src="${msg.image}">` : '';
    el.innerHTML = `<div class="msg-bubble">
        <div class="msg-sender">${mine ? 'אני' : msg.from_name}${mine && msg.id ? ' <button class="btn-icon btn-delete-msg" title="מחיקת ההודעה שלי">🗑</button>' : ''}</div>
        ${msg.text ? '<div class="msg-text"></div>' : ''}
        ${imgHtml}
      </div>`;
    if (msg.text) el.querySelector('.msg-text').textContent = msg.text;
    if (mine && msg.id) {
      el.querySelector('.btn-delete-msg').addEventListener('click', () => {
        if (!confirm('למחוק את ההודעה?')) return;
        socket.emit('delete_private_message', { message_id: msg.id });
      });
    }
    list.appendChild(el);
  });
  list.scrollTop = list.scrollHeight;
}

document.getElementById('form-private-send').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('private-text-input');
  const text = input.value.trim();
  if (!text || !socket || !privateTargetUserId) return;
  socket.emit('send_private_message', { to_user_id: privateTargetUserId, text });
  input.value = '';
});

document.getElementById('private-image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !socket || !privateTargetUserId) return;
  const reader = new FileReader();
  reader.onload = () => socket.emit('send_private_message', { to_user_id: privateTargetUserId, text: '', image: reader.result });
  reader.readAsDataURL(file);
  e.target.value = '';
});

// ---- share my contact details ----

const FIELD_LABELS = {
  name: 'שם', nickname: 'כינוי', title: 'תפקיד', company: 'חברה',
  phone: 'טלפון', email: 'מייל', instagram: 'אינסטגרם', tiktok: 'טיקטוק',
  mood: 'מצב רוח', status: 'סטטוס', bio: 'ביו',
};

let shareTargetUserId = null;

async function openShareContact(p) {
  shareTargetUserId = p.user_id;
  await loadCards();
  const activeCard = cards.find(c => c.is_active);
  const list = document.getElementById('share-fields-list');
  list.innerHTML = '';
  if (!activeCard) {
    list.innerHTML = '<div class="empty-state">אין כרטיס פעיל.</div>';
  } else {
    Object.keys(FIELD_LABELS).forEach(f => {
      const val = activeCard[f];
      if (!val) return;
      const row = document.createElement('label');
      row.className = 'vis-toggle share-field-row';
      row.innerHTML = `<input type="checkbox" data-field="${f}" ${activeCard[f + '_visible'] ? 'checked' : ''}> ${FIELD_LABELS[f]}: ${val}`;
      list.appendChild(row);
    });
  }
  document.getElementById('share-contact-overlay').classList.remove('hidden');
}

document.getElementById('btn-send-contact').addEventListener('click', () => {
  if (!socket || !shareTargetUserId) return;
  const fields = {};
  document.querySelectorAll('#share-fields-list input[type="checkbox"]:checked').forEach(cb => {
    const activeCard = cards.find(c => c.is_active);
    fields[cb.dataset.field] = activeCard[cb.dataset.field];
  });
  socket.emit('share_contact', { to_user_id: shareTargetUserId, fields });
  document.getElementById('share-contact-overlay').classList.add('hidden');
});

// ---- receiving a shared contact ----

function showContactOffer(offer) {
  const body = document.getElementById('contact-offer-body');
  const rows = Object.entries(offer.fields).map(([f, v]) => `<div class="view-field"><span>${FIELD_LABELS[f] || f}</span><b></b></div>`);
  body.innerHTML = `<p class="sub">מאת ${offer.from_name} · האב: ${offer.hub_name}</p>` + rows.join('');
  Object.values(offer.fields).forEach((v, i) => { body.querySelectorAll('.view-field b')[i].textContent = v; });
  document.getElementById('contact-note-input').value = '';
  document.getElementById('contact-offer-overlay').classList.remove('hidden');
}

document.getElementById('btn-save-contact').addEventListener('click', async () => {
  if (!pendingContactOffer) return;
  const note = document.getElementById('contact-note-input').value.trim();
  await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_user_id: pendingContactOffer.from_user_id,
      hub_id: pendingContactOffer.hub_id,
      hub_name: pendingContactOffer.hub_name,
      fields: pendingContactOffer.fields,
      note,
    }),
  });
  document.getElementById('contact-offer-overlay').classList.add('hidden');
  pendingContactOffer = null;
});

// ---------------------------------------------------------------------------
// Phase 4: hub owner controls
// ---------------------------------------------------------------------------

let isHubOwner = false;

function applyHubBackground(imageUrl, musicUrl) {
  const hubScreen = document.getElementById('screen-hub');
  hubScreen.style.backgroundImage = imageUrl ? `linear-gradient(rgba(18,20,31,.82), rgba(18,20,31,.82)), url('${imageUrl}')` : '';
  hubScreen.style.backgroundSize = 'cover';
  hubScreen.style.backgroundPosition = 'center';

  const audio = document.getElementById('hub-music');
  if (musicUrl) {
    if (audio.src !== musicUrl) audio.src = musicUrl;
    audio.play().catch(() => {}); // browsers may block autoplay until user interacts — harmless if it fails silently
  } else {
    audio.pause();
    audio.src = '';
  }
}

document.getElementById('btn-owner-controls').addEventListener('click', () => {
  renderOwnerParticipantList();
  const isProfessional = currentHubType === 'professional';
  document.getElementById('owner-edit-conference-row').classList.toggle('hidden', !isProfessional);
  // Spec: background image/music editing and closing the hub move OUT of
  // this management page for professional hubs — those live in "עריכת
  // ההאב" from "ההאבים שלי" instead. Social/business hubs keep them here.
  document.getElementById('owner-legacy-controls').classList.toggle('hidden', isProfessional);
  document.getElementById('btn-owner-close-hub').classList.toggle('hidden', isProfessional);
  document.getElementById('owner-controls-overlay').classList.remove('hidden');
});

document.getElementById('btn-edit-conference-data').addEventListener('click', () => {
  document.getElementById('owner-controls-overlay').classList.add('hidden');
  openConferenceSetup(currentHubId);
});

document.getElementById('owner-bg-image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !currentHubId) return;
  const reader = new FileReader();
  reader.onload = async () => {
    document.getElementById('owner-bg-preview').src = reader.result;
    document.getElementById('owner-bg-preview').classList.remove('hidden');
    try {
      const res = await fetch(`/api/hubs/${currentHubId}/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: reader.result }),
      });
      const data = await res.json();
      if (res.ok) applyHubBackground(data.background_image_url, data.background_music_url);
      else alert(data.error || 'שגיאה בהעלאת התמונה');
    } catch (err) {
      alert('שגיאה בהעלאת התמונה — נסה קובץ קטן יותר');
    }
  };
  reader.readAsDataURL(file);
});

document.getElementById('owner-bg-music-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !currentHubId) return;
  const reader = new FileReader();
  reader.onload = async () => {
    document.getElementById('owner-music-name').textContent = `🎵 ${file.name}`;
    try {
      const res = await fetch(`/api/hubs/${currentHubId}/background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_url: reader.result }),
      });
      const data = await res.json();
      if (res.ok) applyHubBackground(data.background_image_url, data.background_music_url);
      else alert(data.error || 'שגיאה בהעלאת המוזיקה');
    } catch (err) {
      alert('שגיאה בהעלאת המוזיקה — נסה קובץ קטן יותר');
    }
  };
  reader.readAsDataURL(file);
});

function renderOwnerParticipantList() {
  const list = document.getElementById('owner-participant-list');
  list.innerHTML = '';
  currentPresence.filter(p => p.user_id !== myUserId).forEach(p => {
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <div class="card-row-info">
        <div class="card-row-name">${p.display_name}</div>
        <div class="card-row-sub">${p.is_blocked ? 'חסום מפרסום' : 'רשאי לפרסם'}</div>
      </div>
      <button class="btn ${p.is_blocked ? 'btn-primary' : 'btn-danger'} btn-toggle-block">${p.is_blocked ? 'בטל חסימה' : 'חסום'}</button>`;
    row.querySelector('.btn-toggle-block').addEventListener('click', () => {
      socket.emit('toggle_block', { user_id: p.user_id });
      setTimeout(renderOwnerParticipantList, 300); // presence_list will refresh currentPresence shortly
    });
    list.appendChild(row);
  });
  if (currentPresence.length <= 1) {
    list.innerHTML = '<div class="empty-state">אין עוד נוכחים בהאב.</div>';
  }
}

document.getElementById('btn-owner-close-hub').addEventListener('click', () => {
  if (!confirm('לסגור את ההאב לכל המשתמשים?')) return;
  socket && socket.emit('owner_close_hub', {});
  document.getElementById('owner-controls-overlay').classList.add('hidden');
});

document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.overlay').classList.add('hidden'));
});

// establish the personal connection immediately (once all state above is
// declared) so notifications work even before the person ever opens a hub
ensureSocket();
