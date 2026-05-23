// ─── DOM refs ────────────────────────────────────────────────────────────────
const provider = "gemini";

const requirementsInput = document.getElementById('requirements');
const submitBtn          = document.getElementById('submitBtn');
const consoleOutput      = document.getElementById('consoleOutput');
const preview            = document.getElementById('preview');
const charCount          = document.getElementById('charCount');
const providerSelect     = document.getElementById('providerSelect');
const modelSelect        = document.getElementById('modelSelect');
const modelStatus        = document.getElementById('modelStatus');
const statusBadge        = document.getElementById('statusBadge');
const refreshBtn         = document.getElementById('refreshBtn');
const downloadBtn        = document.getElementById('downloadBtn');

// ─── Firebase Login Check ────────────────────────────────────────────────────
const token = localStorage.getItem("token");

if (!token) {
    logToConsole("⚠ Please login first to generate apps.", "error");
}

// Refresh button — reloads the current iframe URL
refreshBtn.addEventListener('click', () => {
    if (preview.src && preview.src !== 'about:blank') {
        const base = preview.src.split('?')[0];
        preview.src = `${base}?t=${Date.now()}`;
    }
});

// Download button — triggers ZIP download from the server
downloadBtn.addEventListener('click', () => {
    if (!projectDir) return;

    const folderName = projectDir.split(/[\\/]/).pop();

    window.location.href = `/download/${folderName}`;
});

// ─── Character counter ───────────────────────────────────────────────────────
requirementsInput.addEventListener('input', () => {
    const len = requirementsInput.value.length;

    charCount.textContent = `${len} / 2000`;
    charCount.style.color = len > 1800 ? '#f87171' : '#6b7280';
});

// ─── Provider → Model loading ────────────────────────────────────────────────
async function loadModels() {

    modelSelect.disabled = true;
    modelSelect.innerHTML = '<option value="">Loading…</option>';

    modelStatus.textContent = '';
    modelStatus.className   = 'model-status';

    try {

        const res = await fetch(`/api/providers/gemini/models`);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to fetch models');
        }

        const models = data.models || [];

        if (models.length === 0) {
            throw new Error('No models returned by provider');
        }

        modelSelect.innerHTML = models
            .map(m => `<option value="${m}">${m}</option>`)
            .join('');

        modelSelect.disabled = false;

        modelStatus.textContent =
            `✓ ${models.length} model${models.length > 1 ? 's' : ''} available`;

        modelStatus.className = 'model-status success';

    } catch (err) {

        modelSelect.innerHTML = '<option value="">Unavailable</option>';

        modelSelect.disabled = true;

        modelStatus.textContent = `⚠ ${err.message}`;

        modelStatus.className = 'model-status error';
    }
}

// Load Gemini models immediately
loadModels();

// ─── Polling helpers ─────────────────────────────────────────────────────────
let pollingInterval;
let pollingTimeout;
let lastLogCount  = 0;
let projectDir    = null;

const MAX_POLL_MS = 10 * 60 * 1000;

function stopPolling() {

    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    if (pollingTimeout) {
        clearTimeout(pollingTimeout);
        pollingTimeout = null;
    }
}

function setBadge(text, cls) {

    statusBadge.textContent = text;
    statusBadge.className   = `status-badge ${cls}`;
}

async function pollStatus(taskId) {

    try {

        const res = await fetch(`/status/${taskId}`);

        if (!res.ok) {

            logToConsole(`Error fetching status: ${res.statusText}`, 'error');

            stopPolling();

            resetBtn();

            return;
        }

        const data = await res.json();

        // Append only new log lines
        if (data.logs && data.logs.length > lastLogCount) {

            data.logs
                .slice(lastLogCount)
                .forEach(log => logToConsole(log));

            lastLogCount = data.logs.length;
        }

        // Show app name banner
        if (data.app_name && !projectDir) {
            logAppNameBanner(data.app_name);
        }

        // Track project directory
        if (data.project_dir) {
            projectDir = data.project_dir;
        }

        if (data.status === 'done' || data.status === 'error') {

            stopPolling();

            resetBtn();

            if (data.status === 'done') {

                const folderName = projectDir
                    ? projectDir.split(/[\\/]/).pop()
                    : '';

                const previewUrl = folderName
                    ? `/generated_project/${folderName}/index.html?t=${Date.now()}`
                    : `/generated_project/index.html?t=${Date.now()}`;

                preview.src = previewUrl;

                refreshBtn.disabled  = false;
                downloadBtn.disabled = false;

                logToConsole(
                    `🚀 Preview loaded from: ${previewUrl.split('?')[0]}`,
                    'success'
                );

                setBadge('done', 'badge-done');

            } else {

                const errMsg =
                    data.logs && data.logs.length > 0
                        ? data.logs[data.logs.length - 1]
                        : 'Unknown error occurred';

                logToConsole(`Error: ${errMsg}`, 'error');

                setBadge('error', 'badge-error');
            }
        }

    } catch (err) {

        logToConsole(
            'An error occurred while polling for status.',
            'error'
        );

        stopPolling();

        resetBtn();
    }
}

// ─── Generate button ─────────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {

    const requirements = requirementsInput.value.trim();

    if (!requirements) {

        logToConsole(
            'Please enter your app requirements.',
            'error'
        );

        return;
    }

    // Check login token
    const token = localStorage.getItem("token");

    if (!token) {

        logToConsole(
            '⚠ You must login first.',
            'error'
        );

        return;
    }

    const model = modelSelect.value;

    if (!model || model === 'Unavailable') {

        logToConsole(
            'Please select a valid model before generating.',
            'error'
        );

        return;
    }

    // Reset state
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Generating…';

    consoleOutput.innerHTML = '';

    lastLogCount = 0;
    projectDir   = null;

    setBadge('running', 'badge-running');

    logToConsole(
        `⚙ Starting with GEMINI / ${model} …`
    );

    try {

        const res = await fetch('/generate', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },

            body: JSON.stringify({
                prompt: requirements,
                provider: 'gemini',
                model: model
            }),
        });

        if (!res.ok) {

            throw new Error(
                `Server responded with status: ${res.status}`
            );
        }

        const data = await res.json();

        if (data.task_id) {

            stopPolling();

            pollingInterval = setInterval(
                () => pollStatus(data.task_id),
                1000
            );

            pollingTimeout = setTimeout(() => {

                stopPolling();

                logToConsole(
                    'Timed out after 10 minutes. Please try again.',
                    'error'
                );

                setBadge('timeout', 'badge-error');

                resetBtn();

            }, MAX_POLL_MS);

        } else {

            logToConsole('Failed to start task.', 'error');

            resetBtn();
        }

    } catch (err) {

        logToConsole(
            `An error occurred: ${err.message}`,
            'error'
        );

        resetBtn();
    }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resetBtn() {

    submitBtn.textContent = 'Generate App';

    submitBtn.disabled = false;
}

function logAppNameBanner(appName) {

    const banner = document.createElement('div');

    banner.className = 'app-name-banner';

    banner.innerHTML = `
        <span class="banner-label">APP NAME</span>
        <span class="banner-name">${escapeHtml(appName)}</span>
    `;

    consoleOutput.appendChild(banner);

    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function logToConsole(message, type = 'message') {

    const el = document.createElement('p');

    el.textContent = `> ${message}`;

    el.style.margin = '0';

    if (type === 'error') {
        el.style.color = '#f87171';
    }

    if (type === 'success') {
        el.style.color = '#4ade80';
    }

    consoleOutput.appendChild(el);

    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function escapeHtml(str) {

    return str
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;');
}

// ======================================================
// AI CHAT FEATURE
// ======================================================

const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatMessages = document.getElementById("chatMessages");

sendChatBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keypress", function (e) {

    if (e.key === "Enter") {
        sendMessage();
    }

});

async function sendMessage() {

    const message = chatInput.value.trim();

    if (!message) return;

    // show user message
    addMessage("You", message);

    chatInput.value = "";

    try {

        // get firebase token
        const token = localStorage.getItem("token");

        if (!token) {

            addMessage("AI", "Please login first");

            return;
        }

        const res = await fetch("/chat", {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },

            body: JSON.stringify({
                message: message
            })
        });

        const data = await res.json();

        console.log(data);

        if (data.reply) {

            addMessage("AI", data.reply);

        } else if (data.error) {

            addMessage("AI", data.error);

        } else {

            addMessage("AI", "No response");

        }

    } catch (err) {

        console.error(err);

        addMessage("AI", "Error talking to AI");
    }
}

function addMessage(sender, text) {

    const div = document.createElement("div");

    div.style.marginBottom = "10px";

    if (sender === "AI") {
        div.style.color = "#4ade80";
    } else {
        div.style.color = "white";
    }

    div.innerHTML = `
        <strong>${sender}:</strong> ${text}
    `;

    chatMessages.appendChild(div);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// =========================
// CHAT MINIMIZE / MAXIMIZE
// =========================

const chatContainer = document.getElementById("chatContainer");
const toggleChatBtn = document.getElementById("toggleChatBtn");

toggleChatBtn.addEventListener("click", () => {

    chatContainer.classList.toggle("minimized");

    if (chatContainer.classList.contains("minimized")) {
        toggleChatBtn.textContent = "+";
    } else {
        toggleChatBtn.textContent = "−";
    }

});

// function addMessage(sender, text) {

//     const div = document.createElement("div");

//     if (sender === "AI") {
//         div.classList.add("ai-message");
//     }

//     div.innerHTML = `
//         <strong>${sender}:</strong> ${text}
//     `;

//     chatMessages.appendChild(div);

//     chatMessages.scrollTop = chatMessages.scrollHeight;
// }