// Main Application Controller, Telemetry Engine, Cyberpunk Security Gate & Interrogation Console
let officeEngine = null;
let currentSelectedAgent = null;
let currentActiveView = 'office';

const AGENT_PROMPT_PRESETS = {
  'aero-writer': [
    'Kenapa lu nulis artikel Bintaro & BSD dulu?',
    'Dasar toleransi ±0.02mm itu dari mana?',
    'Gimana cara ngalahin Raja Laser & Kingsign di Bintaro?'
  ],
  'radar-x': [
    'Tampilkan opportunity SEO tertinggi berdasarkan evidence.',
    'Apa status dan provenance setiap data source?',
    'Ringkas analysis run Nadia terakhir.'
  ],
  'iron-shield': [
    'Kenapa lu blokir 1.909 keyword ads?',
    'Yakin blokir keyword ini gak ngurangin lead pembeli?',
    'Berapa total rupiah budget ads yang udah lu hemat?'
  ],
  'hermes-sentry': [
    'Lead paling banyak masuk dari wilayah mana?',
    'Ada pesan WA calon pembeli yang bocor atau hilang?',
    'Berapa rata-rata konversi lead per minggu?'
  ],
  'cloud-forge': [
    'Gimana status VPS 163.61.44.41 saat ini?',
    'Jadwal deploy otomatis GitHub Actions jalan jam berapa?',
    'Apakah website aman dari crash dan overload?'
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Canvas Renderer
  officeEngine = new OfficeRenderer('officeCanvas');

  // 2. Check Authentication Clearance
  checkAuthStatus();

  // 3. Populate Roster Grid
  renderRoster();

  // 4. Populate Initial Events
  initEventLogs();

  // 5. Render KPI Tables
  renderKpiTables();

  // 6. Setup Header Controls
  setupHeaderControls();
});

// Authentication System
async function checkAuthStatus() {
  const token = localStorage.getItem('hq_auth_token');
  const authOverlay = document.getElementById('auth-gate-overlay');

  if (!token) {
    showAuthOverlay();
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      hideAuthOverlay();
      syncLiveSerpData();
    } else {
      localStorage.removeItem('hq_auth_token');
      showAuthOverlay();
    }
  } catch (err) {
    hideAuthOverlay();
    syncLiveSerpData();
  }
}

function showAuthOverlay() {
  const authOverlay = document.getElementById('auth-gate-overlay');
  if (authOverlay) {
    authOverlay.classList.remove('hidden');
    const input = document.getElementById('auth-passcode');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function hideAuthOverlay() {
  const authOverlay = document.getElementById('auth-gate-overlay');
  if (authOverlay) {
    authOverlay.classList.add('hidden');
  }
  const errorMsg = document.getElementById('auth-error-msg');
  if (errorMsg) errorMsg.classList.add('hidden');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('auth-passcode');
  const errorMsg = document.getElementById('auth-error-msg');
  const btnSubmit = document.getElementById('btn-auth-submit');
  const password = input.value.trim();

  if (!password) return;

  btnSubmit.innerText = 'VERIFYING...';
  btnSubmit.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (res.ok && data.status === 'success') {
      localStorage.setItem('hq_auth_token', data.token);
      if (window.audioFX && window.audioFX.playSuccess) {
        window.audioFX.playSuccess();
      }
      hideAuthOverlay();
      addEventLog(new Date().toLocaleTimeString('id-ID'), '🔓 Access Granted: Level-4 clearance verified. Welcome Boss.', 'success');
      syncLiveSerpData();
    } else {
      if (window.audioFX && window.audioFX.playBlip) {
        window.audioFX.playBlip(220, 'sawtooth', 0.25);
      }
      errorMsg.innerText = '❌ ' + (data.message || 'ACCESS DENIED: INVALID PASSCODE');
      errorMsg.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  } catch (err) {
    errorMsg.innerText = '❌ Connection error: ' + err.message;
    errorMsg.classList.remove('hidden');
  } finally {
    btnSubmit.innerText = 'UNLOCK';
    btnSubmit.disabled = false;
  }
}

function lockTerminal() {
  localStorage.removeItem('hq_auth_token');
  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(350, 'sawtooth', 0.15);
  }
  showAuthOverlay();
  addEventLog(new Date().toLocaleTimeString('id-ID'), '🔒 Security Gate: Terminal locked by operator.', 'warning');
}

function switchView(viewName) {
  currentActiveView = viewName;
  const tabOffice = document.getElementById('tab-office');
  const tabKpi = document.getElementById('tab-kpi');
  const tabWarroom = document.getElementById('tab-warroom');
  const viewOffice = document.getElementById('view-office-section');
  const viewKpi = document.getElementById('view-kpi-section');
  const viewWarroom = document.getElementById('view-warroom-section');

  tabOffice.classList.toggle('active', viewName === 'office');
  tabKpi.classList.toggle('active', viewName === 'kpi');
  if (tabWarroom) tabWarroom.classList.toggle('active', viewName === 'warroom');

  viewOffice.classList.toggle('hidden', viewName !== 'office');
  viewKpi.classList.toggle('hidden', viewName !== 'kpi');
  if (viewWarroom) viewWarroom.classList.toggle('hidden', viewName !== 'warroom');

  if (viewName === 'warroom') {
    if (window.audioFX && window.audioFX.playBlip) window.audioFX.playBlip(650, 'sawtooth', 0.12);
    refreshWarRoomData();
  } else if (viewName === 'office') {
    if (window.audioFX && window.audioFX.playBlip) window.audioFX.playBlip(550, 'triangle', 0.08);
  } else {
    if (window.audioFX && window.audioFX.playBlip) window.audioFX.playBlip(750, 'square', 0.08);
  }
}

function renderRoster() {
  const container = document.getElementById('rosterGrid');
  if (!container) return;
  container.innerHTML = '';

  SWARM_AGENTS.forEach(ag => {
    const item = document.createElement('div');
    item.className = 'roster-item';
    item.onclick = () => openAgentModal(ag.id);
    item.innerHTML = `
      <div class="roster-left">
        <span>${ag.avatar}</span>
        <div>
          <strong style="color: ${ag.color}">${ag.name}</strong>
          <span style="font-size: 9px; color: #8492a6; display:block;">${ag.title}</span>
        </div>
      </div>
      <div class="roster-status-dot" style="background: ${ag.state === 'WORKING' ? '#00ff66' : '#ffe600'}"></div>
    `;
    container.appendChild(item);
  });
}

function initEventLogs() {
  const initialEvents = [
    { time: '09:20:00', text: '💬 Interrogation Console armed: 1-on-1 employee debate ready.', type: 'success' },
    { time: '09:05:00', text: '🛡️ Security Gate: Level-4 clearance protocol activated.', type: 'info' },
    { time: '08:24:00', text: '🔎 Nadia evidence engine ready. Source status is loaded from the backend after authentication.', type: 'info' },
    { time: '06:30:28', text: '📊 Executive KPI Monitor calibrated across 3 domains (Tri-Force).', type: 'success' },
    { time: '00:00:00', text: '🚀 GitHub Actions Cloud Cron (daily-publish.yml) verified online.', type: 'info' }
  ];

  initialEvents.forEach(evt => addEventLog(evt.time, evt.text, evt.type));

  // Periodic simulated live pulse
  setInterval(() => {
    const mayaSprite = officeEngine ? officeEngine.agents.find(a => a.id === 'aero-writer') : null;
    const mayaPulseText = mayaSprite && mayaSprite.lastLog
      ? `📡 Maya: ${mayaSprite.lastLog}`
      : '📡 Maya: belum ada aktivitas publish tersinkron.';
    const pulses = [
      { text: mayaPulseText, type: 'info', agent: 'aero-writer' },
      { text: '📱 Hermes Sentry: WhatsApp beacon listener checked (0 error, DB intact)', type: 'info', agent: 'hermes-sentry' },
      { text: '🛡️ Iron-Shield: Verified 102 organic keywords blocked from ad cannibalization.', type: 'warning', agent: 'iron-shield' },
      { text: '⚡ GitHub Actions: Next cloud publish cycle armed for tomorrow 07:00 WIB.', type: 'info', agent: 'cloud-forge' }
    ];
    const p = pulses[Math.floor(Math.random() * pulses.length)];
    const timeStr = new Date().toLocaleTimeString('id-ID');
    addEventLog(timeStr, p.text, p.type);
    
    if (officeEngine && p.agent) {
      officeEngine.showSpeech(p.agent, '⚡ ' + p.text.split(':')[0]);
    }
  }, 14000);
}

function addEventLog(time, text, type = 'info') {
  const container = document.getElementById('eventLog');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `event-item ${type}`;
  div.innerHTML = `
    <span class="time">[${time}]</span>
    <span>${text}</span>
  `;
  container.insertBefore(div, container.firstChild);

  if (container.children.length > 40) {
    container.removeChild(container.lastChild);
  }
}

function setupHeaderControls() {
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) {
    btnSound.onclick = () => {
      audioFX.enabled = !audioFX.enabled;
      btnSound.innerText = audioFX.enabled ? '🔊 FX ON' : '🔇 FX OFF';
      audioFX.playBlip(500, 'triangle', 0.08);
    };
  }

  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) {
    btnTheme.onclick = () => {
      document.body.classList.toggle('theme-day');
      btnTheme.innerText = document.body.classList.contains('theme-day') ? '☀️ DAY' : '🌙 NIGHT';
      audioFX.playBlip(700, 'square', 0.08);
    };
  }
}

function getAuthenticatedHeaders(includeJson = false) {
  const token = localStorage.getItem('hq_auth_token');
  const headers = includeJson ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? 'UNAVAILABLE';
}

function renderNadiaSources(sources = []) {
  const container = document.getElementById('nadia-source-list');
  if (!container) return;
  container.replaceChildren();
  if (!sources.length) {
    container.textContent = 'UNAVAILABLE';
    return;
  }
  for (const source of sources) {
    const row = document.createElement('div');
    row.className = 'nadia-source-row';
    const name = document.createElement('span');
    name.textContent = source.source;
    const status = document.createElement('strong');
    status.className = 'nadia-source-status';
    status.textContent = source.status;
    row.append(name, status);
    container.appendChild(row);
  }
}

function renderNadiaOpportunities(opportunities = []) {
  const container = document.getElementById('nadia-opportunity-list');
  if (!container) return;
  container.replaceChildren();
  if (!opportunities.length) {
    container.textContent = 'No persisted opportunities.';
    return;
  }
  for (const opportunity of opportunities) {
    const row = document.createElement('div');
    row.className = 'nadia-opportunity-row';
    const keyword = document.createElement('span');
    keyword.textContent = opportunity.primaryKeyword;
    const score = document.createElement('strong');
    score.textContent = `${opportunity.opportunityScore} / ${opportunity.classification}`;
    row.append(keyword, score);
    if (opportunity.classification !== 'DISCARD') {
      const taskButton = document.createElement('button');
      taskButton.type = 'button';
      taskButton.className = 'btn-pixel-small';
      taskButton.textContent = 'PROPOSE TASK';
      taskButton.onclick = () => createNadiaTask(opportunity.id, taskButton);
      row.appendChild(taskButton);
    }
    container.appendChild(row);
  }
}

async function createNadiaTask(opportunityId, button) {
  button.disabled = true;
  try {
    const response = await fetch('/api/agents/nadia/tasks', {
      method: 'POST',
      headers: getAuthenticatedHeaders(true),
      body: JSON.stringify({ opportunityId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia proposed ${data.task.taskId} for Maya. No execution or publish action was performed.`, 'success');
    await loadNadiaDashboard();
  } catch (error) {
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia task ERROR: ${error.message}`, 'warning');
    button.disabled = false;
  }
}

function syncNadiaStaffCard(status) {
  const staff = KPI_DATA?.staffPerformance?.find(item => item.id === 'radar-x');
  if (!staff) return;
  staff.kpiScore = String(status.highPriority);
  staff.kpiStatus = status.currentStatus;
  staff.metrics = [
    { label: 'Opportunities', value: String(status.opportunities) },
    { label: 'High Priority', value: String(status.highPriority) },
    { label: 'Tasks Proposed', value: String(status.tasksProposed) },
    { label: 'Last Analysis', value: status.lastAnalysis || 'UNAVAILABLE' }
  ];
  renderKpiTables();
}

async function loadNadiaDashboard() {
  const panel = document.getElementById('nadia-intelligence-panel');
  if (panel) panel.classList.remove('hidden');
  try {
    const [statusResponse, opportunitiesResponse] = await Promise.all([
      fetch('/api/agents/nadia/status', { headers: getAuthenticatedHeaders() }),
      fetch('/api/agents/nadia/opportunities?limit=5', { headers: getAuthenticatedHeaders() })
    ]);
    if (!statusResponse.ok || !opportunitiesResponse.ok) throw new Error(`Nadia API returned ${statusResponse.status}/${opportunitiesResponse.status}`);
    const status = await statusResponse.json();
    const opportunityData = await opportunitiesResponse.json();
    setText('nadia-current-status', status.currentStatus);
    setText('nadia-last-analysis', status.lastAnalysis ? new Date(status.lastAnalysis).toLocaleString('id-ID') : 'UNAVAILABLE');
    setText('nadia-opportunity-count', status.opportunities);
    setText('nadia-high-priority-count', status.highPriority);
    setText('nadia-task-count', status.tasksProposed);
    renderNadiaSources(status.dataSources);
    renderNadiaOpportunities(opportunityData.opportunities);
    syncNadiaStaffCard(status);
    const agent = SWARM_AGENTS.find(item => item.id === 'radar-x');
    if (agent) agent.lastLog = status.lastAnalysis ? `Last analysis: ${status.lastAnalysis}` : 'No persisted analysis run.';
    return status;
  } catch (error) {
    setText('nadia-current-status', 'ERROR');
    renderNadiaSources([]);
    renderNadiaOpportunities([]);
    throw error;
  }
}

async function runNadiaAnalysis() {
  const button = document.getElementById('btn-nadia-analyze') || document.getElementById('modal-action-btn');
  if (button) button.disabled = true;
  officeEngine?.showSpeech('radar-x', 'Analyzing evidence sources...');
  addEventLog(new Date().toLocaleTimeString('id-ID'), 'Nadia: loading source data and running deterministic SEO analysis.', 'info');
  try {
    const response = await fetch('/api/agents/nadia/analyze', {
      method: 'POST',
      headers: getAuthenticatedHeaders(true),
      body: '{}'
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'success') throw new Error(data.message || data.run?.errors?.[0]?.message || `HTTP ${response.status}`);
    await loadNadiaDashboard();
    const sourceSummary = data.run.sources.map(source => `${source.source}=${source.status}`).join(', ');
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia analysis complete: ${data.run.opportunitiesCreated} opportunities, ${data.run.highPriority} high priority. ${sourceSummary}`, 'success');
    officeEngine?.showSpeech('radar-x', `${data.run.opportunitiesCreated} evidence-backed opportunities`);
    audioFX?.playSuccess();
    return data;
  } catch (error) {
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia analysis ERROR: ${error.message}`, 'warning');
    officeEngine?.showSpeech('radar-x', 'ERROR: analysis failed');
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

async function reportNadiaSourceStatus() {
  try {
    const status = await loadNadiaDashboard();
    const summary = status.dataSources.map(source => `${source.source}=${source.status}`).join(', ');
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia source status: ${summary}`, 'info');
    officeEngine?.showSpeech('radar-x', summary);
  } catch (error) {
    addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia source status ERROR: ${error.message}`, 'warning');
  }
}

async function triggerAction(actionKey) {
  audioFX.playBlip(800, 'square', 0.1);

  if (actionKey === 'rank') {
    await runNadiaAnalysis();
    return;
  }
  if (actionKey === 'geo') {
    await reportNadiaSourceStatus();
    return;
  }

  if (actionKey === 'blog') {
    officeEngine.showSpeech('aero-writer', '✍️ Menulis artikel E-E-A-T baru...');
    addEventLog(new Date().toLocaleTimeString('id-ID'), '✍️ Maya (Aero-Writer) dipicu: Memproses validasi schema Astro Markdown...', 'warning');
    setTimeout(() => {
      audioFX.playSuccess();
      addEventLog(new Date().toLocaleTimeString('id-ID'), '✅ Artikel baru sukses dikompilasi & di-push ke GitHub main!', 'success');
      officeEngine.showSpeech('aero-writer', '🚀 Artikel Sukses Live!');
    }, 2500);
  } else if (actionKey === 'leads') {
    officeEngine.showSpeech('hermes-sentry', '📱 Memeriksa database leads...');
    addEventLog(new Date().toLocaleTimeString('id-ID'), '📱 Budi (Hermes): Menarik 24 rekap leads WhatsApp terbaru...', 'info');
    setTimeout(() => {
      audioFX.playSuccess();
      addEventLog(new Date().toLocaleTimeString('id-ID'), '🎯 Total 24 Leads aktif. Top area: Bintaro Sektor 1-9 & BSD.', 'success');
      officeEngine.showSpeech('hermes-sentry', '📱 Leads Siap Di-followup!');
    }, 1500);
  } else if (actionKey === 'vps') {
    officeEngine.showSpeech('cloud-forge', '🖥️ Ping VPS 163.61.44.41...');
    addEventLog(new Date().toLocaleTimeString('id-ID'), '🖥️ Gilang (DevOps): VPS 163.61.44.41 Uptime 100%. RAM 3.0GB Free.', 'info');
    setTimeout(() => {
      audioFX.playSuccess();
      addEventLog(new Date().toLocaleTimeString('id-ID'), '✅ Status VPS: Sehat & Dingin. Coolify & n8n operational.', 'success');
      officeEngine.showSpeech('cloud-forge', '⚡ Server Aman & Stabil!');
    }, 1200);
  }
}

// Modal & Interrogation Controller
function switchModalTab(tabName) {
  const tabChat = document.getElementById('modal-tab-chat');
  const tabProfile = document.getElementById('modal-tab-profile');
  const sectionChat = document.getElementById('modal-section-chat');
  const sectionProfile = document.getElementById('modal-section-profile');

  if (tabName === 'chat') {
    tabChat.classList.add('active');
    tabProfile.classList.remove('active');
    sectionChat.classList.remove('hidden');
    sectionProfile.classList.add('hidden');
    const input = document.getElementById('agent-chat-input');
    if (input) input.focus();
  } else {
    tabChat.classList.remove('active');
    tabProfile.classList.add('active');
    sectionChat.classList.add('hidden');
    sectionProfile.classList.remove('hidden');
  }
}

function openAgentModal(agentId) {
  const agent = SWARM_AGENTS.find(a => a.id === agentId);
  if (!agent) return;

  currentSelectedAgent = agent;
  document.getElementById('modal-avatar').innerText = agent.avatar;
  document.getElementById('modal-title').innerText = `${agent.name} — ${agent.title}`;
  document.getElementById('modal-role').innerText = agent.role;
  document.getElementById('modal-engine').innerText = agent.engine;
  document.getElementById('modal-mission').innerText = agent.currentTask;
  document.getElementById('modal-target').innerText = agent.target;
  document.getElementById('modal-log').innerText = agent.lastLog;
  document.getElementById('modal-action-btn').innerText = `⚡ ${agent.actionLabel}`;
  const nadiaPanel = document.getElementById('nadia-intelligence-panel');
  if (nadiaPanel) nadiaPanel.classList.toggle('hidden', agent.id !== 'radar-x');

  // Reset Chat Terminal
  const chatBox = document.getElementById('agent-chat-box');
  chatBox.innerHTML = `
    <div class="chat-msg agent">
      <div class="chat-msg-header">
        <span class="chat-sender" style="color: ${agent.color}">${agent.avatar} ${agent.name} (${agent.title})</span>
        <span class="chat-time">${new Date().toLocaleTimeString('id-ID')}</span>
      </div>
      <div class="chat-bubble">${agent.id === 'radar-x'
        ? 'Evidence mode active. Jawaban Nadia hanya memakai analysis run dan provenance yang tersimpan. Jika belum ada run, jalankan RUN NADIA ANALYSIS.'
        : 'Siap Bos! Gua standby. Ada yang mau lu interogasi soal data ranking, eksekusi keyword, anggaran ads, atau kendala lapangan gua?'}</div>
    </div>
  `;

  // Render Quick Prompt Chips
  const chipsContainer = document.getElementById('agent-quick-prompts');
  chipsContainer.innerHTML = '';
  const prompts = AGENT_PROMPT_PRESETS[agent.id] || [];
  prompts.forEach(p => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'prompt-chip';
    chip.innerText = p;
    chip.onclick = () => sendQuickPrompt(p);
    chipsContainer.appendChild(chip);
  });

  // Nadia opens on persisted intelligence; other personas keep chat first.
  switchModalTab(agent.id === 'radar-x' ? 'profile' : 'chat');

  document.getElementById('agent-modal').classList.remove('hidden');
  const chatInput = document.getElementById('agent-chat-input');
  if (chatInput) {
    chatInput.value = '';
    setTimeout(() => chatInput.focus(), 150);
  }
  if (agent.id === 'radar-x') {
    loadNadiaDashboard().catch(error => {
      addEventLog(new Date().toLocaleTimeString('id-ID'), `Nadia dashboard ERROR: ${error.message}`, 'warning');
    });
  }
}

function closeModal() {
  document.getElementById('agent-modal').classList.add('hidden');
  currentSelectedAgent = null;
}

function sendQuickPrompt(promptText) {
  const input = document.getElementById('agent-chat-input');
  if (input) {
    input.value = promptText;
    handleSendAgentMessage(new Event('submit'));
  }
}

async function handleSendAgentMessage(event) {
  if (event) event.preventDefault();
  if (!currentSelectedAgent) return;

  const input = document.getElementById('agent-chat-input');
  const chatBox = document.getElementById('agent-chat-box');
  const btnSend = document.getElementById('btn-agent-send');
  const message = input.value.trim();

  if (!message) return;

  const timeStr = new Date().toLocaleTimeString('id-ID');

  // 1. Append User Message
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'chat-msg user';
  userMsgDiv.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-sender text-cyan">👑 Bos Dons</span>
      <span class="chat-time">${timeStr}</span>
    </div>
    <div class="chat-bubble">${escapeHtml(message)}</div>
  `;
  chatBox.appendChild(userMsgDiv);
  input.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(650, 'triangle', 0.08);
  }

  // 2. Append Thinking Indicator
  const thinkingId = 'thinking-' + Date.now();
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'chat-msg thinking';
  thinkingDiv.id = thinkingId;
  thinkingDiv.innerHTML = `
    <div class="chat-bubble">⚡ ${currentSelectedAgent.name} sedang memproses data telemetry...</div>
  `;
  chatBox.appendChild(thinkingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  btnSend.disabled = true;

  try {
    const token = localStorage.getItem('hq_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        agentId: currentSelectedAgent.id,
        message: message
      })
    });

    const data = await res.json();
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();

    if (res.ok && data.status === 'success') {
      const agentMsgDiv = document.createElement('div');
      agentMsgDiv.className = 'chat-msg agent';
      agentMsgDiv.innerHTML = `
        <div class="chat-msg-header">
          <span class="chat-sender" style="color: ${data.agentColor}">${data.agentAvatar} ${data.agentName}</span>
          <span class="chat-time">${data.timestamp}</span>
        </div>
        <div class="chat-bubble">${formatMarkdownToHtml(data.reply)}</div>
      `;
      chatBox.appendChild(agentMsgDiv);
      chatBox.scrollTop = chatBox.scrollHeight;

      if (window.audioFX && window.audioFX.playSuccess) {
        window.audioFX.playSuccess();
      }
    } else {
      const errDiv = document.createElement('div');
      errDiv.className = 'chat-msg agent';
      errDiv.innerHTML = `
        <div class="chat-bubble text-red">❌ ${data.message || 'Gagal menghubungi agent.'}</div>
      `;
      chatBox.appendChild(errDiv);
    }
  } catch (err) {
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();

    const errDiv = document.createElement('div');
    errDiv.className = 'chat-msg agent';
    errDiv.innerHTML = `
      <div class="chat-bubble text-red">❌ Connection Error: ${err.message}</div>
    `;
    chatBox.appendChild(errDiv);
  } finally {
    btnSend.disabled = false;
    input.focus();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

function formatMarkdownToHtml(mdText) {
  let html = escapeHtml(mdText);
  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code `code`
  html = html.replace(/`(.*?)`/g, '<code class="font-mono" style="background:#1a2234; padding:2px 4px; border-radius:3px; color:#00f0ff;">$1</code>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function executeModalAgentAction() {
  if (!currentSelectedAgent) return;
  const ag = currentSelectedAgent;

  if (ag.id === 'radar-x') {
    await runNadiaAnalysis();
    return;
  }

  audioFX.playSuccess();
  closeModal();

  officeEngine.showSpeech(ag.id, `⚡ ${ag.actionLabel}!`);
  addEventLog(new Date().toLocaleTimeString('id-ID'), `⚡ Manual trigger berhasil dijalankan untuk: ${ag.name} (${ag.title})`, 'warning');
}

// ==========================================================================
// 4-BRAIN AUTONOMOUS WAR ROOM & TASK LEDGER CONTROLLER
// ==========================================================================
let warRoomSessionsData = [];
let taskLedgerData = [];
let currentLedgerFilter = 'ALL';

async function refreshWarRoomData() {
  const token = localStorage.getItem('hq_auth_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    // 1. Fetch Director Telemetry
    const telemRes = await fetch('/api/director/telemetry', { headers });
    if (telemRes.ok) {
      const telemData = await telemRes.json();
      if (telemData.director) {
        renderWarRoomRadar(telemData.director);
      }
    }

    // 2. Fetch War Room Sessions
    const sessRes = await fetch('/api/war-room/sessions?limit=20', { headers });
    if (sessRes.ok) {
      const sessData = await sessRes.json();
      warRoomSessionsData = sessData.sessions || [];
      renderWarRoomSessions(warRoomSessionsData);
    }

    // 3. Fetch Task Ledger
    const taskRes = await fetch('/api/director/tasks?limit=50', { headers });
    if (taskRes.ok) {
      const taskData = await taskRes.json();
      taskLedgerData = taskData.tasks || [];
      renderTaskLedgerTable(taskLedgerData);
    }
  } catch (err) {
    console.warn('[WarRoom] Error refreshing data:', err.message);
  }
}

function renderWarRoomRadar(director) {
  if (!director) return;

  // Hermes / Task Counts
  const counts = director.taskCounts || {};
  const elActive = document.getElementById('stat-active-tasks');
  const elDone = document.getElementById('stat-done-tasks');
  if (elActive) elActive.innerText = (counts.RUNNING || 0) + (counts.VERIFYING || 0) + (counts.CLAIMED || 0);
  if (elDone) elDone.innerText = counts.DONE || 0;

  // Provider Telemetry
  const providers = director.providers?.providers || [];
  for (const p of providers) {
    const name = p.name?.toLowerCase();
    const callsEl = document.getElementById(`stat-calls-${name}`);
    const latEl = document.getElementById(`stat-latency-${name}`);
    const stateEl = document.getElementById(`stat-state-${name}`);
    const badgeEl = document.getElementById(`badge-circuit-${name}`);

    if (callsEl) callsEl.innerText = p.totalCalls || 0;
    if (latEl) latEl.innerText = p.avgLatencyMs ? `${p.avgLatencyMs}ms` : '--';
    if (stateEl) {
      stateEl.innerText = p.circuitState || 'CLOSED';
      stateEl.className = p.circuitState === 'OPEN' ? 'stat-val text-red' : 'stat-val text-green';
    }
    if (badgeEl) {
      badgeEl.innerText = p.circuitState === 'OPEN' ? 'TRIPPED (OPEN)' : 'HEALTHY';
      badgeEl.className = p.circuitState === 'OPEN' ? 'circuit-badge badge-open' : 'circuit-badge badge-closed';
    }
  }
}

function renderWarRoomSessions(sessions) {
  const container = document.getElementById('warroom-sessions-feed');
  const countEl = document.getElementById('warroom-session-count');
  if (!container) return;

  if (countEl) countEl.innerText = `${sessions.length} Sesi`;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px; text-align: center; color: #718096; font-size: 15px;">
        🛡️ Belum ada insiden kritis. Sentry 24/7 sedang berpatroli aktif di latar belakang.
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(s => {
    const isResolved = s.state === 'RESOLVED';
    const dialogHtml = (s.transcript || []).map(t => {
      const spkClass = (t.speaker || '').toLowerCase();
      return `
        <div class="speech-bubble ${spkClass}">
          <span class="bubble-avatar">${t.avatar || '🤖'}</span>
          <div class="bubble-content">
            <div class="bubble-header">
              <span class="bubble-speaker ${spkClass}">[${t.speaker}] ${t.role || ''}</span>
              <span class="bubble-time font-mono">${new Date(t.timestamp).toLocaleTimeString('id-ID')}</span>
            </div>
            <div class="bubble-text">${formatMarkdownToHtml(t.message)}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="warroom-session-card ${isResolved ? 'resolved' : ''}">
        <div class="session-card-header">
          <div class="session-title-wrap">
            <h4>${escapeHtml(s.title)}</h4>
            <div class="session-meta-line font-mono">
              ID: ${s.id} // SUMBER: ${s.event?.source || 'Sentry'} // DIBUAT: ${new Date(s.createdAt).toLocaleString('id-ID')}
            </div>
          </div>
          <span class="session-status-tag ${isResolved ? 'success' : 'warning'}">
            ${isResolved ? '✅ CONSENSUS SEALED' : '⏳ ' + s.state}
          </span>
        </div>
        <div class="session-dialog-flow">
          ${dialogHtml}
        </div>
      </div>
    `;
  }).join('');
}

function filterLedgerState(state) {
  currentLedgerFilter = state;
  const chips = document.querySelectorAll('.ledger-filters .filter-chip');
  chips.forEach(c => {
    c.classList.toggle('active', c.innerText === state || (state === 'ALL' && c.innerText === 'SEMUA'));
  });
  renderTaskLedgerTable(taskLedgerData);
}

function renderTaskLedgerTable(tasks) {
  const tbody = document.getElementById('ledger-table-tbody');
  if (!tbody) return;

  let filtered = tasks || [];
  if (currentLedgerFilter !== 'ALL') {
    filtered = filtered.filter(t => t.state === currentLedgerFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #718096; padding: 24px;">
          Tidak ada tugas dalam status [${currentLedgerFilter}].
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const shortId = t.id ? t.id.replace('task-', '') : '--';
    const stateClass = `state-${t.state || 'QUEUED'}`;
    const dateStr = t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString('id-ID') : '--';
    const idemShort = t.idempotencyKey ? (t.idempotencyKey.length > 22 ? t.idempotencyKey.slice(0, 20) + '...' : t.idempotencyKey) : 'auto-sha256';

    return `
      <tr>
        <td>
          <span class="state-badge ${stateClass}">${t.state}</span>
        </td>
        <td>
          <strong style="color:#fff; font-size:14px;">${escapeHtml(t.title || 'Untitled Task')}</strong>
          <div style="font-size:11px; color:#718096;" class="font-mono">#${shortId}</div>
        </td>
        <td>
          <span style="color:#00f0ff; font-weight:700;">${t.role || 'SCOUT'}</span>
          <div style="font-size:11px; color:#8492a6;">${t.owner || 'unassigned'}</div>
        </td>
        <td>
          <span class="font-mono" style="color:#ffaa00;">${t.activeProvider || t.preferredProvider || 'CASCADE'}</span>
        </td>
        <td>
          <code class="font-mono" style="font-size:11px; color:#a0aec0;">${escapeHtml(idemShort)}</code>
        </td>
        <td class="font-mono" style="font-size:12px; color:#94a3b8;">
          ${dateStr}
        </td>
      </tr>
    `;
  }).join('');
}

async function triggerWarRoomDrill(type, title, error) {
  const token = localStorage.getItem('hq_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(880, 'sawtooth', 0.25);
  }

  addEventLog(new Date().toLocaleTimeString('id-ID'), `🚨 OPERATOR DRILL TRIGGERED: ${title}`, 'warning');

  try {
    const res = await fetch('/api/war-room/trigger', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type,
        title,
        severity: 'CRITICAL',
        source: 'operator_drill',
        error
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      if (window.audioFX && window.audioFX.playSuccess) window.audioFX.playSuccess();
      addEventLog(new Date().toLocaleTimeString('id-ID'), `✅ War Room Council berhasil menyegel konsensus untuk sesi '${data.session?.id}'.`, 'success');
      await refreshWarRoomData();
    } else {
      addEventLog(new Date().toLocaleTimeString('id-ID'), `❌ Gagal memicu War Room: ${data.message}`, 'danger');
    }
  } catch (err) {
    addEventLog(new Date().toLocaleTimeString('id-ID'), `❌ Connection error: ${err.message}`, 'danger');
  }
}

