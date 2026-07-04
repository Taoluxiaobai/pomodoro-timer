/* ============================================
   Pomodoro Timer - Application Logic
   ============================================ */

// --- Constants ---
const MODES = {
  work: { label: '专注', duration: 25 * 60, color: 'work' },
  shortBreak: { label: '短休息', duration: 5 * 60, color: 'break' },
  longBreak: { label: '长休息', duration: 15 * 60, color: 'long-break' },
};

const CIRCUMFERENCE = 2 * Math.PI * 90; // r=90 → ~565.49

// --- DOM Elements ---
const timerText = document.getElementById('timerText');
const ringProgress = document.querySelector('.ring-progress');
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnReset = document.getElementById('btnReset');
const btnSkip = document.getElementById('btnSkip');
const sessionCount = document.getElementById('sessionCount');
const sessionDots = document.getElementById('sessionDots');
const toggleOnTop = document.getElementById('toggleOnTop');
const modeBtns = document.querySelectorAll('.mode-btn');

// --- State ---
let currentMode = 'work';
let timeRemaining = MODES.work.duration;
let totalDuration = MODES.work.duration;
let timerInterval = null;
let isRunning = false;
let completedSessions = 0;
let currentCycleSessions = 0; // 0-3, resets after long break

// --- Audio ---
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency = 880, duration = 0.15) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio not supported — fail silently
  }
}

function playCompletionSound() {
  // Three ascending beeps
  playBeep(660, 0.2);
  setTimeout(() => playBeep(880, 0.2), 200);
  setTimeout(() => playBeep(1100, 0.3), 400);
}

// --- Timer ---
function startTimer() {
  if (isRunning) return;
  isRunning = true;
  updateButtonStates();

  timerInterval = setInterval(() => {
    timeRemaining--;
    updateDisplay();

    if (timeRemaining <= 0) {
      handleTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  updateButtonStates();
}

function resetTimer() {
  pauseTimer();
  timeRemaining = MODES[currentMode].duration;
  totalDuration = MODES[currentMode].duration;
  updateDisplay();
}

function skipTimer() {
  pauseTimer();
  timeRemaining = 0;
  handleTimerComplete();
}

function handleTimerComplete() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;

  playCompletionSound();
  notifyCompletion();

  if (currentMode === 'work') {
    completedSessions++;
    currentCycleSessions++;
    updateSessionDisplay();
    saveSessions();

    if (currentCycleSessions >= 4) {
      currentCycleSessions = 0;
      switchMode('longBreak');
    } else {
      switchMode('shortBreak');
    }
  } else {
    // Break finished → back to work
    if (currentMode === 'longBreak') {
      currentCycleSessions = 0;
      updateSessionDisplay();
    }
    switchMode('work');
  }
}

function switchMode(mode) {
  currentMode = mode;
  timeRemaining = MODES[mode].duration;
  totalDuration = MODES[mode].duration;
  updateDisplay();
  updateModeButtons();

  // Auto-start the new session
  startTimer();
}

// --- Display ---
function updateDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Progress ring
  const progress = 1 - timeRemaining / totalDuration;
  const offset = CIRCUMFERENCE * (1 - progress);
  ringProgress.style.strokeDashoffset = offset;

  // Urgent pulse (< 10s)
  if (timeRemaining <= 10 && isRunning) {
    timerText.classList.add('urgent');
  } else {
    timerText.classList.remove('urgent');
  }

  // Color the ring based on mode
  ringProgress.classList.remove('break-mode', 'long-break-mode');
  if (currentMode === 'shortBreak') {
    ringProgress.classList.add('break-mode');
  } else if (currentMode === 'longBreak') {
    ringProgress.classList.add('long-break-mode');
  }
}

function updateButtonStates() {
  btnStart.disabled = isRunning;
  btnPause.disabled = !isRunning;
  btnReset.disabled = false;
  btnSkip.disabled = false;
}

function updateModeButtons() {
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

function updateSessionDisplay() {
  sessionCount.textContent = completedSessions;
  const dots = sessionDots.querySelectorAll('.dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('completed', i < currentCycleSessions);
  });
}

// --- Notifications ---
async function notifyCompletion() {
  const modeInfo = MODES[currentMode];
  let title, body;

  if (currentMode === 'work') {
    title = '🍅 番茄钟完成！';
    body = '太棒了！休息一下吧~';
  } else {
    title = '🔔 休息时间结束';
    body = '准备好开始新的番茄钟了吗？';
  }

  // Try Electron notification
  if (window.electronAPI) {
    try {
      await window.electronAPI.sendNotification(title, body);
    } catch (e) {
      // Fallback to web Notification
      sendWebNotification(title, body);
    }
  } else {
    sendWebNotification(title, body);
  }
}

function sendWebNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(title, { body });
      }
    });
  }
}

// --- Persistence ---
function saveSessions() {
  const today = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem('pomodoro-stats') || '{}');
  if (data.date !== today) {
    data.date = today;
    data.count = 0;
  }
  data.count = completedSessions;
  localStorage.setItem('pomodoro-stats', JSON.stringify(data));
}

function loadSessions() {
  const data = JSON.parse(localStorage.getItem('pomodoro-stats') || '{}');
  const today = new Date().toDateString();
  if (data.date === today) {
    completedSessions = data.count || 0;
  } else {
    completedSessions = 0;
  }
  // currentCycleSessions tracks the current cycle (0-3)
  currentCycleSessions = completedSessions % 4;
  updateSessionDisplay();
}

// --- Event Listeners ---
btnStart.addEventListener('click', startTimer);
btnPause.addEventListener('click', pauseTimer);
btnReset.addEventListener('click', resetTimer);
btnSkip.addEventListener('click', skipTimer);

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isRunning) {
      if (!confirm('切换模式会重置当前计时，确定要切换吗？')) return;
    }
    pauseTimer();
    const mode = btn.dataset.mode;
    currentMode = mode;
    timeRemaining = MODES[mode].duration;
    totalDuration = MODES[mode].duration;
    currentCycleSessions = completedSessions % 4;
    updateDisplay();
    updateModeButtons();
  });
});

toggleOnTop.addEventListener('change', async () => {
  if (window.electronAPI) {
    try {
      await window.electronAPI.setAlwaysOnTop(toggleOnTop.checked);
    } catch (e) {
      console.error('Failed to toggle always-on-top:', e);
    }
  }
});

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
      break;
    case 'KeyR':
      if (!e.ctrlKey && !e.metaKey) {
        resetTimer();
      }
      break;
    case 'KeyS':
      if (!e.ctrlKey && !e.metaKey) {
        skipTimer();
      }
      break;
  }
});

// --- Initialization ---
function init() {
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Load saved sessions
  loadSessions();

  // Set initial display
  timeRemaining = MODES.work.duration;
  totalDuration = MODES.work.duration;
  currentMode = 'work';
  ringProgress.style.strokeDasharray = CIRCUMFERENCE;
  ringProgress.style.strokeDashoffset = '0';
  updateDisplay();
  updateModeButtons();
  updateButtonStates();

  // Restore always-on-top state
  if (window.electronAPI) {
    window.electronAPI.getAlwaysOnTop().then((isOnTop) => {
      toggleOnTop.checked = isOnTop;
    }).catch(() => {});
  }
}

init();
