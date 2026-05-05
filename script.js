// Security states are now in-memory only (will reset on page reload)
let failedAttempts = 0;
let lockdownCount = 0;
let isLocked = false;
let lockdownEndTime = null;
let currentCaptcha = "";
let cooldownTimer = null;

// Initialize Captcha
window.onload = generateCaptcha;
document.getElementById('refreshCaptcha').addEventListener('click', generateCaptcha);

function generateCaptcha() {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let captcha = "";
    for (let i = 0; i < 6; i++) {
        captcha += chars[Math.floor(Math.random() * chars.length)];
    }
    currentCaptcha = captcha;
    document.getElementById('captchaCode').innerText = captcha;
    document.getElementById('captchaInput').value = "";
}

function resetForm() {
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
    generateCaptcha();
}

function saveLog(username, password, status, info = "") {
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    const randomIP = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const newLog = {
        ip: randomIP,
        timestamp: new Date().toLocaleString(),
        username: username || "(empty)",
        password: password || "(empty)",
        status: status,
        info: info
    };
    logs.unshift(newLog); 
    localStorage.setItem('security_logs', JSON.stringify(logs));
}

document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    
    if (isLocked) {
        showModal('lockdown', Math.ceil((lockdownEndTime - Date.now()) / 1000));
        return;
    }

    const userInp = document.getElementById('username').value.toLowerCase();
    const passInp = document.getElementById('password').value.toLowerCase();
    const captchaInp = document.getElementById('captchaInput').value;

    if (captchaInp !== currentCaptcha) {
        showModal('failed_captcha');
        return;
    }

    try {
        const response = await fetch('database.json');
        const data = await response.json();
        
        // Check for Bad Words
        const containsBadword = data.badwords.some(word => userInp.includes(word) || passInp.includes(word));
        
        if (containsBadword) {
            saveLog(userInp, passInp, "BANNED", "Badword Detected");
            startExtendedLockdown();
            showModal('badword_ban');
            return;
        }

        const allUsers = [...data.users, ...data.admins];
        const user = allUsers.find(u => u.username.toLowerCase() === userInp && u.password.toLowerCase() === passInp);

        if (user) {
            saveLog(userInp, passInp, "Success");
            failedAttempts = 0;
            lockdownCount = 0;
            
            if (user.category === 'admin') {
                showAdminDashboard();
            } else {
                showModal('success');
            }
        } else {
            saveLog(userInp, passInp, "Rejected");
            failedAttempts++;
            
            if (failedAttempts >= 3) {
                lockdownCount++;
                if (lockdownCount >= 3) {
                    startExtendedLockdown();
                } else {
                    startLockdownTimer(30);
                }
            } else {
                showModal('failed');
            }
        }
    } catch (error) {
        console.error('Error loading database:', error);
    }
});

function startLockdownTimer(seconds) {
    isLocked = true;
    lockdownEndTime = Date.now() + (seconds * 1000);
    failedAttempts = 0;
    
    lockForm(seconds);
    showModal('lockdown', seconds);

    const loginBtn = document.querySelector('button');
    if (cooldownTimer) clearInterval(cooldownTimer);
    
    cooldownTimer = setInterval(() => {
        let secondsLeft = Math.ceil((lockdownEndTime - Date.now()) / 1000);
        loginBtn.innerText = `Lockdown (${secondsLeft}s)`;
        const timerSpan = document.getElementById('lockdownTimer');
        if (timerSpan) timerSpan.innerText = secondsLeft;

        if (secondsLeft <= 0) {
            clearInterval(cooldownTimer);
            unlockForm();
        }
    }, 1000);
}

function startExtendedLockdown() {
    isLocked = true;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    lockdownEndTime = tomorrow.getTime();

    const displayTime = "Tomorrow 12:00 PM";
    lockFormExtended(displayTime);
}

function lockForm(seconds) {
    document.querySelector('.form-box').classList.add('locked');
    const btn = document.querySelector('button');
    btn.innerText = `Lockdown (${seconds}s)`;
    btn.disabled = true;
}

function lockFormExtended(timeStr) {
    document.querySelector('.form-box').classList.add('locked');
    const btn = document.querySelector('button');
    btn.innerText = `Closed until ${timeStr}`;
    btn.disabled = true;
}

function unlockForm() {
    isLocked = false;
    lockdownEndTime = null;
    document.querySelector('.form-box').classList.remove('locked');
    const btn = document.querySelector('button');
    btn.innerText = 'Log in';
    btn.disabled = false;
    resetForm();
}

function showAdminDashboard() {
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    const modalOverlay = document.getElementById('modalOverlay');
    let logRows = logs.map(log => `
        <div class="log-entry ${log.status === 'BANNED' ? 'log-banned' : ''}">
            <p><strong>IP:</strong> ${log.ip}</p>
            <p><strong>User:</strong> ${log.username}</p>
            <p><strong>Pass:</strong> ${log.password}</p>
            <p><strong>Status:</strong> <span class="status-${log.status.toLowerCase()}">${log.status}</span></p>
            ${log.info ? `<p><strong>Info:</strong> ${log.info}</p>` : ''}
            <small>${log.timestamp}</small>
        </div>
    `).join('');

    modalOverlay.innerHTML = `
        <div class="admin-dashboard">
            <div class="dashboard-header"><h2>Security Logs</h2><button class="close-dash" onclick="closeModal()">✕</button></div>
            <div class="log-container">${logRows || '<p style="color:#666">No logs yet.</p>'}</div>
            <button class="clear-logs" onclick="clearLogs()">Clear All Logs</button>
        </div>
    `;
    modalOverlay.style.display = 'flex';
}

function clearLogs() {
    if(confirm("Are you sure you want to delete all security logs?")) {
        localStorage.removeItem('security_logs');
        showAdminDashboard();
    }
}

function showModal(status, displayValue = '') {
    const modalOverlay = document.getElementById('modalOverlay');
    let content = '';
    if (status === 'success') {
        content = `<div class="status-card success-card"><div class="card-content"><div class="status-icon">✓</div><h3>Success!</h3><p>Authentication Confirmed</p></div><button onclick="closeModal()">DONE</button></div>`;
    } else if (status === 'lockdown') {
        content = `<div class="status-card failed-card"><div class="card-content"><div class="status-icon">🔒</div><h3>Lockdown</h3><p>System locked for <span id="lockdownTimer">${displayValue}</span> seconds.</p></div><button onclick="closeModal()">OK</button></div>`;
    } else if (status === 'extendedLockdown') {
        content = `<div class="status-card failed-card"><div class="card-content"><div class="status-icon">🚨</div><h3>System Closed</h3><p>Account suspended until <b>${displayValue}</b> (IST).</p></div><button onclick="closeModal()">LOCKED</button></div>`;
    } else if (status === 'badword_ban') {
        content = `<div class="status-card failed-card"><div class="card-content"><div class="status-icon">⚠️</div><h3>Security Violation</h3><p>Forbidden content detected. Account suspended until <b>Tomorrow 12:00 PM</b>.</p></div><button onclick="closeModal()">BANNED</button></div>`;
    } else if (status === 'failed_captcha') {
        content = `<div class="status-card failed-card"><div class="card-content"><div class="status-icon">🤖</div><h3>Captcha Error</h3><p>Invalid Captcha code.</p></div><button onclick="closeModal()">TRY AGAIN</button></div>`;
    } else {
        content = `<div class="status-card failed-card"><div class="card-content"><div class="status-icon">✕</div><h3>Failed</h3><p>Invalid Credentials (${3 - failedAttempts} attempts remaining)</p></div><button onclick="closeModal()">TRY AGAIN</button></div>`;
    }
    modalOverlay.innerHTML = content;
    modalOverlay.style.display = 'flex';
}

function closeModal() {
    // We no longer reload automatically because that would clear the lockdown.
    // If the user manually reloads, the lockdown will be gone as requested.
    document.getElementById('modalOverlay').style.display = 'none';
}

function exitSystem() {
    if(confirm("Are you sure you want to shut down the Sentinel Security System?")) {
        const modalOverlay = document.getElementById('modalOverlay');
        modalOverlay.innerHTML = `
            <div class="status-card failed-card" style="background: rgba(0,0,0,0.8); border: 2px solid #e74c3c;">
                <div class="card-content">
                    <div class="status-icon">🔌</div>
                    <h3>System Offline</h3>
                    <p>Sentinel Security System has been shut down successfully.</p>
                </div>
                <button onclick="location.reload()" style="background: #27ae60">RESTART</button>
            </div>
        `;
        modalOverlay.style.display = 'flex';
        document.querySelector('.form-box').style.display = 'none';
    }
}
