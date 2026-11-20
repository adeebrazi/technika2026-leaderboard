/**
 * TECHNIKA 6.0 // WINNER MANAGEMENT CONSOLE
 * Realtime Admin Interface for Declaring, Editing & Removing Event Winners
 */

let supabaseClient = null;
let allEvents = [];
let allParticipants = [];
let allWinners = [];
let activeEvent = null;
let selectedParticipant = null;

// Initialize Supabase Client
function initSupabase() {
  if (typeof supabase === 'undefined' || !CONFIG || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
    showToast('⚠️ Supabase configuration missing in config.js', '#FF0055');
    return;
  }
  supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  console.log('[Admin] Supabase client initialized.');
}

// Show Toast Alert
function showToast(msg, bg = '#000000', color = '#FFFFFF') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = bg;
  toast.style.color = color;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

// Fetch all necessary data
async function fetchData() {
  if (!supabaseClient) return;

  const statusEl = document.getElementById('lastSyncStatus');
  if (statusEl) statusEl.textContent = 'SYNCING DATA...';

  try {
    // 1. Fetch Events
    const { data: events, error: evError } = await supabaseClient
      .from('events')
      .select('*')
      .order('name');
    if (!evError && events) {
      allEvents = events.filter(e => e.event_type !== 'SYSTEM');
      populateEventDropdown();
    }

    // 2. Fetch Winners
    const { data: winners, error: winError } = await supabaseClient
      .from('winners')
      .select('*')
      .order('position', { ascending: true });
    if (!winError && winners) {
      allWinners = winners;
    }

    // 3. Fetch Participants
    const { data: participants, error: partError } = await supabaseClient
      .from('participants')
      .select('registration_id, name, college, gender, phone, email');
    if (!partError && participants) {
      allParticipants = participants;
    }

    if (statusEl) {
      statusEl.textContent = 'SYNC: ACTIVE (' + new Date().toLocaleTimeString() + ')';
    }

    // If an event is currently selected, refresh its podium
    if (activeEvent) {
      renderCurrentPodium();
    }
  } catch (err) {
    console.error('[Admin] Error fetching data:', err);
    showToast('❌ Sync Error: ' + err.message, '#FF0055');
  }
}

// Populate Events Dropdown grouped by Category
function populateEventDropdown() {
  const sel = document.getElementById('eventSelect');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '<option value="" disabled selected>-- Choose an Event to Manage (47 Total) --</option>';

  const categories = ['Technical', 'Cultural', 'Creative', 'Special'];
  categories.forEach(cat => {
    const groupEvents = allEvents.filter(e => (e.category || '').toLowerCase() === cat.toLowerCase());
    if (groupEvents.length === 0) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = `--- ${cat.toUpperCase()} EVENTS (${groupEvents.length}) ---`;

    groupEvents.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.event_id;
      opt.textContent = `${e.name} (${e.event_id})`;
      optgroup.appendChild(opt);
    });

    sel.appendChild(optgroup);
  });

  if (currentVal) {
    sel.value = currentVal;
  }
}

// Handle Event Selection
function onEventSelected(eventId) {
  activeEvent = allEvents.find(e => e.event_id === eventId);
  if (!activeEvent) return;

  // Show Strip Info
  const strip = document.getElementById('eventInfoStrip');
  if (strip) strip.style.display = 'flex';

  const catEl = document.getElementById('infoCategory');
  if (catEl) catEl.textContent = `CATEGORY: ${(activeEvent.category || 'GENERAL').toUpperCase()}`;

  const typeEl = document.getElementById('infoType');
  const isSolo = activeEvent.is_solo ? 'SOLO' : 'TEAM';
  if (typeEl) typeEl.textContent = `FORMAT: ${isSolo}`;

  const limitsEl = document.getElementById('infoLimits');
  const minM = activeEvent.min_team_size || 1;
  const maxM = activeEvent.max_team_size || 1;
  if (limitsEl) limitsEl.textContent = `LIMITS: ${minM} MIN / ${maxM} MAX PER POSITION`;

  const venueEl = document.getElementById('infoVenue');
  if (venueEl) venueEl.textContent = `VENUE: ${(activeEvent.venue || 'CAMPUS').toUpperCase()}`;

  renderCurrentPodium();
}

// Render the 1st and 2nd place lists for the selected event
function renderCurrentPodium() {
  if (!activeEvent) return;

  const eventWinners = allWinners.filter(w => w.event_id === activeEvent.event_id);
  const pos1 = eventWinners.filter(w => w.position === 1);
  const pos2 = eventWinners.filter(w => w.position === 2);

  renderPositionList('winnerList1', pos1, 1);
  renderPositionList('winnerList2', pos2, 2);
}

function renderPositionList(containerId, list, pos) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">No ${pos === 1 ? '1st place winner' : 'runner-up'} declared yet.</div>`;
    return;
  }

  container.innerHTML = '';
  list.forEach(w => {
    const regId = (w.registration_id || '').toUpperCase().trim();
    const pInfo = allParticipants.find(p => (p.registration_id || '').toUpperCase().trim() === regId);
    const pName = pInfo ? pInfo.name : 'Unknown Participant';
    const pCollege = pInfo ? pInfo.college : 'Unknown College';

    const row = document.createElement('div');
    row.className = 'winner-row';
    row.innerHTML = `
      <div>
        <div class="winner-name">${escapeHtml(pName)}</div>
        <div class="winner-meta">${escapeHtml(regId)} // ${escapeHtml(pCollege)}</div>
      </div>
      <button class="btn-remove" data-event="${escapeHtml(w.event_id)}" data-pos="${w.position}" data-reg="${escapeHtml(regId)}">
        ✖ REMOVE
      </button>
    `;
    container.appendChild(row);
  });

  // Attach Remove Listeners
  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const evId = e.target.getAttribute('data-event');
      const position = parseInt(e.target.getAttribute('data-pos'), 10);
      const reg = e.target.getAttribute('data-reg');
      await removeWinner(evId, position, reg);
    });
  });
}

// Remove / Delete a winner record
async function removeWinner(eventId, position, registrationId) {
  if (!confirm(`Are you sure you want to remove ${registrationId} from Position ${position}?`)) {
    return;
  }

  showToast('Removing winner...', '#FF6B00');

  try {
    const { error } = await supabaseClient
      .from('winners')
      .delete()
      .match({
        event_id: eventId,
        position: position,
        registration_id: registrationId
      });

    if (error) throw error;

    showToast(`✅ Successfully removed ${registrationId}`, '#000000');
    // Local state update
    allWinners = allWinners.filter(w => !(w.event_id === eventId && w.position === position && (w.registration_id || '').toUpperCase() === registrationId));
    renderCurrentPodium();
  } catch (err) {
    console.error('[Admin] Remove error:', err);
    showToast('❌ Remove Failed: ' + err.message, '#FF0055');
  }
}

// Setup Participant Search / Autocomplete
function setupAutocomplete() {
  const input = document.getElementById('studentSearch');
  const resultsBox = document.getElementById('searchResults');
  const previewBox = document.getElementById('selectedParticipantPreview');

  if (!input || !resultsBox) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      resultsBox.style.display = 'none';
      return;
    }

    const matches = allParticipants.filter(p => {
      const name = (p.name || '').toLowerCase();
      const id = (p.registration_id || '').toLowerCase();
      const col = (p.college || '').toLowerCase();
      return name.includes(q) || id.includes(q) || col.includes(q);
    }).slice(0, 8); // Top 8 matches

    if (matches.length === 0) {
      resultsBox.innerHTML = '<div class="search-result-item" style="color:#777;">No participants found</div>';
      resultsBox.style.display = 'block';
      return;
    }

    resultsBox.innerHTML = '';
    matches.forEach(p => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div class="item-title">${escapeHtml(p.name)} (${escapeHtml(p.registration_id)})</div>
        <div class="item-sub">${escapeHtml(p.college)} // ${escapeHtml(p.gender || 'N/A')}</div>
      `;
      item.addEventListener('click', () => {
        selectedParticipant = p;
        input.value = `${p.name} (${p.registration_id})`;
        previewBox.innerHTML = `
          <div style="color:#000;">👤 <strong>${escapeHtml(p.name)}</strong></div>
          <div style="color:#5C201C; margin-top:3px;">ID: ${escapeHtml(p.registration_id)} | College: ${escapeHtml(p.college)} | Gender: ${escapeHtml(p.gender || 'N/A')}</div>
        `;
        resultsBox.style.display = 'none';
      });
      resultsBox.appendChild(item);
    });

    resultsBox.style.display = 'block';
  });

  // Hide autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.style.display = 'none';
    }
  });
}

// Assign Winner / Runner-up
async function assignWinner() {
  if (!activeEvent) {
    showToast('⚠️ Please select an event first!', '#FF6B00');
    return;
  }

  if (!selectedParticipant) {
    showToast('⚠️ Please search and select a participant first!', '#FF6B00');
    return;
  }

  const position = parseInt(document.getElementById('posSelect').value, 10);
  const regId = (selectedParticipant.registration_id || '').toUpperCase().trim();
  const pts = position === 1 ? 10 : 7;

  // Validation Check: Max Team Size
  const currentInPos = allWinners.filter(w => w.event_id === activeEvent.event_id && w.position === position);
  const maxLimit = activeEvent.max_team_size || 1;

  if (currentInPos.length >= maxLimit) {
    const posName = position === 1 ? 'Winner' : 'Runner-up';
    if (!confirm(`Warning: This event max team size is ${maxLimit}. Position ${posName} already has ${currentInPos.length} member(s). Add another member anyway?`)) {
      return;
    }
  }

  // Duplicate Check
  const alreadyIn = currentInPos.some(w => (w.registration_id || '').toUpperCase() === regId);
  if (alreadyIn) {
    showToast(`⚠️ ${regId} is already assigned to this position!`, '#FF6B00');
    return;
  }

  showToast('Assigning winner to database...', '#000000');

  try {
    const payload = {
      event_id: activeEvent.event_id,
      position: position,
      registration_id: regId,
      points_awarded: pts,
      declared_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from('winners')
      .upsert(payload, { onConflict: 'event_id,position,registration_id' });

    if (error) throw error;

    showToast(`🎉 Declared ${selectedParticipant.name} as Position ${position}!`, '#22C55E', '#000000');

    // Reset Form
    document.getElementById('studentSearch').value = '';
    document.getElementById('selectedParticipantPreview').innerHTML = 'No participant selected yet.';
    selectedParticipant = null;

    // Refresh data
    await fetchData();
  } catch (err) {
    console.error('[Admin] Assign error:', err);
    showToast('❌ Assignment Failed: ' + err.message, '#FF0055');
  }
}

// Realtime Subscription
function setupRealtime() {
  if (!supabaseClient) return;

  const channel = supabaseClient
    .channel('technika-admin-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, () => {
      console.log('[Admin Realtime] Winners table changed. Refreshing...');
      fetchData();
    })
    .subscribe();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Window Onload Initialization
window.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  fetchData();
  setupAutocomplete();
  setupRealtime();

  // Event Dropdown Change Listener
  const eventSel = document.getElementById('eventSelect');
  if (eventSel) {
    eventSel.addEventListener('change', (e) => onEventSelected(e.target.value));
  }

  // Assign Winner Button
  const btnAssign = document.getElementById('btnAssignWinner');
  if (btnAssign) {
    btnAssign.addEventListener('click', assignWinner);
  }

  // Force Refresh Button
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchData();
      showToast('🔄 Synced latest records from Supabase', '#000000');
    });
  }
});

