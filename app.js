// ----------------------------------------------------------------------------
// TECHNIKA 2026 NEO-BRUTALIST LIVE LEADERBOARD LOGIC
// Realtime updates, Top 10 Boys & Girls, Institute Filtering & University Rankings
// ----------------------------------------------------------------------------

let supabaseClient = null;
let allParticipants = [];
let allWinners = [];
let allEvents = [];
let allAttendance = [];
let realtimeChannel = null;

// Normalization map for common university variants
function normalizeUniversity(rawCollege) {
  if (!rawCollege) return 'Other / Not Specified';
  const clean = rawCollege.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('arka jain') || lower.includes('aju') || lower.includes('jgi')) {
    return 'Arka Jain University';
  }
  if (lower.includes('nit') && (lower.includes('jsr') || lower.includes('jamshedpur'))) {
    return 'NIT Jamshedpur';
  }
  if (lower.includes('kolhan')) {
    return 'Kolhan University';
  }
  if (lower.includes('bit') && lower.includes('mesra')) {
    return 'BIT Mesra';
  }
  if (lower.includes('karim city')) {
    return 'Karim City College';
  }
  if (lower.includes('jamshedpur cooperative') || lower.includes('cooperative')) {
    return 'Jamshedpur Co-operative College';
  }
  if (lower.includes('rvs')) {
    return 'R.V.S College of Engineering';
  }
  if (lower.includes('loyola')) {
    return 'Loyola College';
  }

  // Capitalize neatly
  return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Initialize Supabase Client & Realtime Subscription
function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    setupRealtimeSubscription();
  } else {
    console.error('Supabase client failed to load');
  }
}

// Subscribe to postgres changes for live updates
function setupRealtimeSubscription() {
  if (!supabaseClient) return;

  try {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient
      .channel('technika-leaderboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, (payload) => {
        console.log('Realtime winners update detected:', payload);
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, (payload) => {
        console.log('Realtime attendance update detected:', payload);
        fetchData();
      })
      .subscribe((status) => {
        const syncEl = document.getElementById('lastSyncTime');
        if (syncEl) {
          if (status === 'SUBSCRIBED') {
            syncEl.textContent = 'SYNC: REALTIME CONNECTED (' + new Date().toLocaleTimeString() + ')';
            syncEl.style.color = '#D6FD52';
          } else {
            syncEl.textContent = 'SYNC: ' + status;
          }
        }
      });
  } catch (e) {
    console.warn('Realtime subscription error:', e);
  }
}

// Fetch all required data from Supabase
async function fetchData() {
  if (!supabaseClient) return;

  try {
    // 1. Fetch Events
    const { data: events, error: evError } = await supabaseClient
      .from('events')
      .select('event_id, name, category, event_type')
      .order('name');
    if (!evError && events) {
      allEvents = events.filter(e => e.event_type !== 'SYSTEM');
    }

    // 2. Fetch Winners
    const { data: winners, error: winError } = await supabaseClient
      .from('winners')
      .select('event_id, position, registration_id, team_id, points_awarded, declared_at')
      .order('position', { ascending: true });
    if (!winError && winners) {
      allWinners = winners;
    }

    // 3. Fetch Participants (with university/college and gender)
    const { data: participants, error: partError } = await supabaseClient
      .from('participants')
      .select('registration_id, name, college, gender, course, semester');
    if (!partError && participants) {
      allParticipants = participants;
      populateInstituteDropdown();
    }

    // 4. Fetch Attendance for Technical Events (+1 pt per attended technical event)
    const { data: attendance, error: attError } = await supabaseClient
      .from('attendance')
      .select('event_id, registration_id, present')
      .eq('present', true);
    if (!attError && attendance) {
      allAttendance = attendance;
    }

    const syncEl = document.getElementById('lastSyncTime');
    if (syncEl) {
      syncEl.textContent = 'LAST SYNC: ' + new Date().toLocaleTimeString();
    }

    renderLeaderboards();
  } catch (err) {
    console.error('Error fetching leaderboard data:', err);
  }
}

// Populate the Institute / University dropdown with distinct entries
function populateInstituteDropdown() {
  const select = document.getElementById('instituteFilter');
  if (!select) return;

  const currentVal = select.value;
  const univSet = new Set();

  allParticipants.forEach(p => {
    const norm = normalizeUniversity(p.college);
    if (norm && norm !== 'Other / Not Specified') {
      univSet.add(norm);
    }
  });

  const sortedUnivs = Array.from(univSet).sort();

  // Clear existing except "ALL"
  select.innerHTML = '<option value="ALL">ALL INSTITUTES / UNIVERSITIES</option>';
  sortedUnivs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    select.appendChild(opt);
  });

  // Keep previous selection if available
  if (currentVal && sortedUnivs.includes(currentVal)) {
    select.value = currentVal;
  }
}

// Calculate scores and render all views
function renderLeaderboards() {
  const selectedInstitute = document.getElementById('instituteFilter').value;
  const selectedCategory = document.getElementById('categoryFilter').value.toUpperCase();
  const searchQuery = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  // Map of eventId -> event object
  const eventMap = new Map();
  allEvents.forEach(e => eventMap.set(e.event_id, e));

  // Set of Technical event IDs (Technical attendance gives +1 pt)
  const technicalEventIds = new Set(
    allEvents
      .filter(e => (e.category || '').toLowerCase() === 'technical')
      .map(e => e.event_id)
  );

  // Filter events according to selectedCategory if not 'ALL'
  const matchingEventIds = new Set();
  allEvents.forEach(e => {
    const cat = (e.category || '').toUpperCase();
    if (selectedCategory === 'ALL' || cat === selectedCategory) {
      matchingEventIds.add(e.event_id);
    }
  });

  // Calculate scores per participant
  // Rule: Winner = 10 pts (pos 1), Runner-Up = 7 pts (pos 2).
  // Rule: Technical event attendance = +1 pt per attended technical event.
  const scoresMap = new Map();

  // 1. Process Winner Points
  allWinners.forEach(w => {
    if (selectedCategory !== 'ALL' && !matchingEventIds.has(w.event_id)) return;

    const regId = (w.registration_id || '').toUpperCase().trim();
    if (!regId) return;

    if (w.position !== 1 && w.position !== 2) return;

    const current = scoresMap.get(regId) || { points: 0, wins: [], topPos: 99, attendedTechEvents: 0 };
    const pts = w.position === 1 ? 10 : 7;
    current.points += pts;
    current.wins.push(w);
    if (w.position < current.topPos) current.topPos = w.position;
    scoresMap.set(regId, current);
  });

  // 2. Process Attendance Points (+1 pt for attending each Technical competition event)
  allAttendance.forEach(a => {
    if (!a.present) return;
    if (!technicalEventIds.has(a.event_id)) return; // Only technical events award attendance points
    if (selectedCategory !== 'ALL' && !matchingEventIds.has(a.event_id)) return;

    const regId = (a.registration_id || '').toUpperCase().trim();
    if (!regId) return;

    const current = scoresMap.get(regId) || { points: 0, wins: [], topPos: 99, attendedTechEvents: 0 };
    current.points += 1;
    current.attendedTechEvents = (current.attendedTechEvents || 0) + 1;
    scoresMap.set(regId, current);
  });

  // 3. Build Participant Records
  const processedStudents = [];
  // University Stats Map: universityName -> { totalPoints: 0, studentScores: [], participantsCount: 0, winsCount: 0 }
  const univMap = new Map();

  allParticipants.forEach(p => {
    const regId = (p.registration_id || '').toUpperCase().trim();
    const stats = scoresMap.get(regId);
    const pts = stats ? stats.points : 0;
    const topPos = stats ? stats.topPos : 999;
    const winDetails = stats ? stats.wins : [];
    const techAttended = stats ? stats.attendedTechEvents : 0;
    const normUniv = normalizeUniversity(p.college);

    // Track University Aggregate Stats
    const uStats = univMap.get(normUniv) || {
      university: normUniv,
      totalPoints: 0,
      studentsWithPoints: 0,
      totalParticipants: 0,
      totalWins: 0
    };
    uStats.totalParticipants += 1;
    uStats.totalPoints += pts;
    if (pts > 0) uStats.studentsWithPoints += 1;
    uStats.totalWins += winDetails.length;
    univMap.set(normUniv, uStats);

    // Filter by Institute dropdown
    if (selectedInstitute !== 'ALL' && normUniv !== selectedInstitute) {
      return;
    }

    // Only include participants who have earned points (> 0)
    // If no points have been awarded yet, they will not occupy top spots with 0 pts
    if (pts <= 0) {
      return;
    }

    // Filter by Search Query
    if (searchQuery) {
      const matchName = (p.name || '').toLowerCase().includes(searchQuery);
      const matchUniv = normUniv.toLowerCase().includes(searchQuery);
      const matchId = regId.toLowerCase().includes(searchQuery);
      if (!matchName && !matchUniv && !matchId) return;
    }

    processedStudents.push({
      ...p,
      points: pts,
      topPos: topPos,
      wins: winDetails,
      attendedTechEvents: techAttended,
      normCollege: normUniv
    });
  });

  // Sort Students: Points DESC, Top Position ASC, Name ASC
  processedStudents.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.topPos !== b.topPos) return a.topPos - b.topPos;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Split into Boys and Girls
  const boys = [];
  const girls = [];

  processedStudents.forEach(p => {
    const g = (p.gender || '').trim().toLowerCase();
    if (g === 'female' || g === 'girl' || g === 'f') {
      girls.push(p);
    } else {
      boys.push(p);
    }
  });

  // Slice Top 10 for each side
  const top10Boys = boys.slice(0, 10);
  const top10Girls = girls.slice(0, 10);

  // Render Students View (Top 10 Boys & Girls)
  renderStudentColumn(top10Boys, 'boysList', 'boysCountBadge', 'BOYS');
  renderStudentColumn(top10Girls, 'girlsList', 'girlsCountBadge', 'GIRLS');

  // Render University Rankings
  let univList = Array.from(univMap.values());
  if (selectedInstitute !== 'ALL') {
    univList = univList.filter(u => u.university === selectedInstitute);
  }
  if (searchQuery) {
    univList = univList.filter(u => u.university.toLowerCase().includes(searchQuery));
  }

  // Sort University: Total Points DESC, Total Wins DESC, Students with Points DESC
  univList.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return b.studentsWithPoints - a.studentsWithPoints;
  });

  renderUniversityRankings(univList);
}

// Render Student Column (Strictly Top 10)
function renderStudentColumn(list, containerId, countBadgeId, label) {
  const container = document.getElementById(containerId);
  const countBadge = document.getElementById(countBadgeId);

  if (countBadge) {
    countBadge.textContent = `TOP ${list.length} ${label}`;
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ⏳ RESULTS YET TO BE ANNOUNCED<br>
        <span style="font-size: 0.78rem; opacity: 0.8; font-weight: 600;">Points will appear live once judges or scanner coordinators declare winners.</span>
      </div>
    `;
    return;
  }

  let html = '';
  list.forEach((person, index) => {
    const rank = index + 1;
    let rankClass = '';
    let medalEmoji = '';
    if (rank === 1) { rankClass = 'rank-1'; medalEmoji = '🥇 '; }
    else if (rank === 2) { rankClass = 'rank-2'; medalEmoji = '🥈 '; }
    else if (rank === 3) { rankClass = 'rank-3'; medalEmoji = '🥉 '; }

    const university = person.normCollege;
    const winsCount = person.wins ? person.wins.length : 0;
    const techAttended = person.attendedTechEvents || 0;

    let tagHtml = [];
    if (winsCount > 0) {
      tagHtml.push(`<span class="tag-pill win">★ ${winsCount} WIN${winsCount > 1 ? 'S' : ''}</span>`);
    }
    if (techAttended > 0) {
      tagHtml.push(`<span class="tag-pill tech">⚡ ${techAttended} TECH ATTENDED</span>`);
    }
    if (tagHtml.length === 0) {
      tagHtml.push(`<span class="tag-pill">PARTICIPANT</span>`);
    }

    html += `
      <div class="brut-card">
        <div class="rank-stamp ${rankClass}">#${rank}</div>
        
        <div class="card-body">
          <div class="card-name">${medalEmoji}${escapeHtml(person.name || 'Anonymous')}</div>
          <div class="card-univ" title="${escapeHtml(university)}">
            🏛️ ${escapeHtml(university)}
          </div>
          <div class="card-tags">
            ${tagHtml.join(' ')}
            ${person.registration_id ? `<span class="tag-pill" style="opacity:0.8;">ID: ${escapeHtml(person.registration_id)}</span>` : ''}
          </div>
        </div>

        <div class="score-badge">
          <div class="score-val">${person.points}</div>
          <div class="score-lbl">PTS</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render University Performance Rankings
function renderUniversityRankings(univList) {
  const container = document.getElementById('universityList');
  const countBadge = document.getElementById('univCountBadge');

  if (countBadge) {
    countBadge.textContent = `${univList.length} UNIVERSITIES RANKED`;
  }

  if (univList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        [NO UNIVERSITY DATA MATCHING CURRENT FILTERS]
      </div>
    `;
    return;
  }

  let html = '';
  univList.forEach((univ, index) => {
    const rank = index + 1;
    let rankClass = '';
    let medalEmoji = '';
    if (rank === 1) { rankClass = 'rank-1'; medalEmoji = '🏆 '; }
    else if (rank === 2) { rankClass = 'rank-2'; medalEmoji = '🥈 '; }
    else if (rank === 3) { rankClass = 'rank-3'; medalEmoji = '🥉 '; }

    html += `
      <div class="univ-card">
        <div class="univ-left">
          <div class="rank-stamp ${rankClass}">#${rank}</div>
          <div class="univ-info">
            <div class="univ-title">${medalEmoji}${escapeHtml(univ.university)}</div>
            <div class="univ-stats">
              <span>👥 <strong>${univ.studentsWithPoints}</strong> Scored Students</span>
              <span>•</span>
              <span>🎖️ <strong>${univ.totalWins}</strong> Total Event Wins</span>
              <span>•</span>
              <span>📋 <strong>${univ.totalParticipants}</strong> Enrolled Participants</span>
            </div>
          </div>
        </div>

        <div class="univ-score-group">
          <div class="score-badge" style="min-width: 90px; background: #000;">
            <div class="score-val" style="color: var(--accent-neon-yellow);">${univ.totalPoints}</div>
            <div class="score-lbl">TOTAL PTS</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// DOM Setup & Navigation Handlers
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  fetchData();

  // Tab switching: Students (Boys & Girls) vs University Standings
  const tabStudentsBtn = document.getElementById('tabStudentsBtn');
  const tabUniversityBtn = document.getElementById('tabUniversityBtn');
  const studentsView = document.getElementById('studentsView');
  const universityView = document.getElementById('universityView');

  tabStudentsBtn.addEventListener('click', () => {
    tabStudentsBtn.classList.add('active');
    tabUniversityBtn.classList.remove('active');
    studentsView.classList.add('active');
    universityView.classList.remove('active');
  });

  tabUniversityBtn.addEventListener('click', () => {
    tabUniversityBtn.classList.add('active');
    tabStudentsBtn.classList.remove('active');
    universityView.classList.add('active');
    studentsView.classList.remove('active');
  });

  // Filters change listeners
  document.getElementById('instituteFilter').addEventListener('change', renderLeaderboards);
  document.getElementById('categoryFilter').addEventListener('change', renderLeaderboards);

  // Search input with debounce
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderLeaderboards, 150);
  });

  // Manual Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    btn.style.opacity = '0.5';
    fetchData().finally(() => {
      btn.style.opacity = '1';
    });
  });

  // Fallback Polling every 12 seconds in case realtime web socket disconnects
  if (CONFIG.POLL_INTERVAL_MS > 0) {
    setInterval(fetchData, CONFIG.POLL_INTERVAL_MS);
  }
});
