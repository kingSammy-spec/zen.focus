let initialTime = 25 * 60; // tracks chosen duration for Reset
let timeLeft = initialTime;
let timerId = null;
let totalFocusTime = 0;
let sessionsCompleted = 0;

const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const soundCards = document.querySelectorAll('.sound-card');
const customHrs  = document.getElementById('custom-hrs');
const customMins = document.getElementById('custom-mins');
const customSecs = document.getElementById('custom-secs');
const setTimeBtn = document.getElementById('set-time-btn');
const presetBtns = document.querySelectorAll('.preset-btn');
const liveAdjust = document.getElementById('live-adjust');
const adjPlus    = document.getElementById('adj-plus');
const adjMinus   = document.getElementById('adj-minus');

const MAX_TIME = 12 * 60 * 60; // 12 hours in seconds

const BIBLE_VERSES = [
    { text: "For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.", ref: "Jeremiah 29:11" },
    { text: "I can do all things through him who strengthens me.", ref: "Philippians 4:13" },
    { text: "Trust in the Lord with all your heart, and do not lean on your own understanding.", ref: "Proverbs 3:5" },
    { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
    { text: "Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.", ref: "Joshua 1:9" },
    { text: "But they who wait for the Lord shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.", ref: "Isaiah 40:31" },
    { text: "Cast all your anxiety on him because he cares for you.", ref: "1 Peter 5:7" },
    { text: "And we know that for those who love God all things work together for good, for those who are called according to his purpose.", ref: "Romans 8:28" },
    { text: "Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.", ref: "Philippians 4:6" },
    { text: "Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid.", ref: "John 14:27" }
];

let bibleInterval = null;
const verseDisplay = document.getElementById('bible-verse-display');

// --- Custom Time Setter Logic ---
function applyTime(hrs = 0, mins = 0, secs = 0) {
    if (timerId) return; // locked while running
    let total = (parseInt(hrs) || 0) * 3600
              + (parseInt(mins) || 0) * 60
              + (parseInt(secs) || 0);
    total = Math.max(1, Math.min(total, MAX_TIME));
    initialTime = total;
    timeLeft = total;
    syncInputs();
    updateDisplay();
}

function syncInputs() {
    customHrs.value  = Math.floor(timeLeft / 3600);
    customMins.value = Math.floor((timeLeft % 3600) / 60);
    customSecs.value = String(timeLeft % 60).padStart(2, '0');
}

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTime(0, btn.getAttribute('data-mins'), 0);
    });
});

setTimeBtn.addEventListener('click', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    applyTime(customHrs.value, customMins.value, customSecs.value);
});

// Enter key to set
[customHrs, customMins, customSecs].forEach(input => {
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') setTimeBtn.click();
    });
});

// Live +/- adjust (only while running)
adjPlus.addEventListener('click', () => {
    timeLeft = Math.min(timeLeft + 300, MAX_TIME); // +5 min
    initialTime = Math.max(initialTime, timeLeft);
    updateDisplay();
});

adjMinus.addEventListener('click', () => {
    timeLeft = Math.max(timeLeft - 300, 1); // -5 min, never below 1s
    updateDisplay();
});

// --- Navigation Logic ---
const navLinks = document.querySelectorAll('#main-nav a');
const views = document.querySelectorAll('.view-section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const targetId = link.getAttribute('data-target');
        views.forEach(v => {
            v.style.display = v.id === targetId ? 'block' : 'none';
        });

        if (targetId === 'view-stats') {
            updateDeviceStats();
        }
    });
});

// --- Timer Logic ---
function updateDisplay() {
    const h = Math.floor(timeLeft / 3600);
    const m = Math.floor((timeLeft % 3600) / 60);
    const s = timeLeft % 60;
    timerDisplay.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

startBtn.addEventListener('click', () => {
    if (timerId) {
        // Pausing
        clearInterval(timerId);
        timerId = null;
        startBtn.innerText = 'Start';
        liveAdjust.style.display = 'none';
        pauseAllActiveAudio();
    } else {
        // Starting
        timerId = setInterval(() => {
            timeLeft--;
            updateDisplay();

            // Accumulate focus time
            if (timeLeft % 60 === 0) totalFocusTime++;

            if (timeLeft <= 0) {
                clearInterval(timerId);
                timerId = null;
                sessionsCompleted++;
                liveAdjust.style.display = 'none';
                pauseAllActiveAudio();
                
                // Trigger programmatic Interstitial skip ad
                showSessionInterstitialAd(() => {
                    const celebrationModal = document.getElementById('celebrationModal');
                    if (celebrationModal) celebrationModal.style.display = 'flex';
                    resetTimer();
                });
            }
        }, 1000);
        startBtn.innerText = 'Pause';
        liveAdjust.style.display = 'flex';
        
        // Warm up speech synthesis (needed for some browsers)
        const warmUp = new SpeechSynthesisUtterance("");
        window.speechSynthesis.speak(warmUp);
        
        playAllActiveAudio();
    }
});

function resetTimer() {
    clearInterval(timerId);
    timerId = null;
    timeLeft = initialTime;
    updateDisplay();
    syncInputs();
    startBtn.innerText = 'Start';
    liveAdjust.style.display = 'none';
    pauseAllActiveAudio();
}

resetBtn.addEventListener('click', resetTimer);

// --- Web Audio API Synthesiser ---
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
const activeSounds = {}; // { soundType: { nodes: [...], gainNode } }

function getCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function createNoise(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
}

function buildSound(type) {
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime); // Start at target volume immediately
    gain.connect(ctx.destination);
    const nodes = [];

    if (type === 'rain') {
        const players = [
            new Audio('asset/mixkit-thunder-rumble-during-a-storm-2395.wav'),
            new Audio('asset/mixkit-thunder-rumble-during-a-storm-2395.wav')
        ];
        const playerGains = [ctx.createGain(), ctx.createGain()];
        let currentPlayerIndex = 0;
        let crossfadeInterval = null;

        players.forEach((audio, i) => {
            audio.loop = false;
            playerGains[i].gain.value = 0;
            playerGains[i].connect(gain);
            const source = ctx.createMediaElementSource(audio);
            source.connect(playerGains[i]);
            nodes.push(source); // track for cleanup
        });

        function doLoop() {
            players[0].currentTime = 0;
            players[0].play().catch(e => console.error("Rain loop failed:", e));
        }

        // Start player
        players[0].play().catch(e => console.error("Rain start failed:", e));
        playerGains[0].gain.setValueAtTime(1, ctx.currentTime);

        // Schedule subsequent loops every 50s
        crossfadeInterval = setInterval(doLoop, 50000);

        nodes.push({ 
            stop: () => { 
                clearInterval(crossfadeInterval);
                players.forEach(p => { p.pause(); p.remove(); });
            }
        });
    }

    if (type === 'forest') {
        const audio = new Audio('asset/mixkit-forest-birds-ambience-1210.mp3');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Forest playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'waves') {
        const audio = new Audio('asset/mixkit-small-waves-harbor-rocks-1208.mp3');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Waves playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'fire') {
        const audio = new Audio('asset/mixkit-campfire-night-wind-1736.wav');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Fire playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'racetrack') {
        const audio = new Audio('asset/videoplayback.mp3');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Racing playback failed:", e));

        nodes.push({ 
            stop: () => { 
                audio.pause(); 
                audio.remove(); 
            }, 
            source 
        });
    }

    if (type === 'cheering') {
        const audio = new Audio('asset/mixkit-ending-show-audience-clapping-478.wav');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Cheering playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'thunder') {
        const audio = new Audio('asset/mixkit-thunder-rumble-during-a-storm-2395.wav');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Thunder playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'children') {
        const audio = new Audio('asset/mixkit-busy-park-playground-with-kids-playing-2264.mp3');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Children playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'money') {
        const audio = new Audio('asset/videoplayback (1).mp4');
        audio.loop = true;
        
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        
        audio.play().catch(e => console.error("Money playback failed:", e));
        nodes.push({ stop: () => { audio.pause(); audio.remove(); }, source });
    }

    if (type === 'bible') {
        startBibleVerses();
    }

    return { nodes, gainNode: gain };
}

function startBibleVerses() {
    if (bibleInterval) return;
    
    function showNextVerse() {
        if (!activeSounds['bible'] || !timerId) {
            stopBibleVerses();
            return;
        }
        
        const verse = BIBLE_VERSES[Math.floor(Math.random() * BIBLE_VERSES.length)];
        if (verseDisplay) verseDisplay.innerText = `"${verse.text}" — ${verse.ref}`;
        
        const utterance = new SpeechSynthesisUtterance(verse.text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        
        // Clear any previous speech to prevent queuing delays
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }
    
    showNextVerse();
    bibleInterval = setInterval(showNextVerse, 15000); // Continuous cycle every 15 seconds
}

function stopBibleVerses() {
    clearInterval(bibleInterval);
    bibleInterval = null;
    verseDisplay.innerText = "";
    window.speechSynthesis.cancel();
}

function startSound(type) {
    if (activeSounds[type]) return;
    activeSounds[type] = buildSound(type);
}

function stopSound(type) {
    if (type === 'bible') stopBibleVerses();
    
    const s = activeSounds[type];
    if (!s) return;
    const ctx = getCtx();

    if (type === 'rain') {
        // Instant stop for rain only
        if (s.gainNode) s.gainNode.gain.setValueAtTime(0, ctx.currentTime);
        cleanup();
    } else {
        // Fade out for everything else
        if (s.gainNode) s.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
        setTimeout(cleanup, 1600);
    }

    function cleanup() {
        if (s.nodes) {
            s.nodes.forEach(n => { 
                try { 
                    if (n.stop) n.stop(); 
                    if (n.disconnect) n.disconnect(); 
                } catch(e){} 
            });
        }
        if (s.gainNode) s.gainNode.disconnect();
        delete activeSounds[type];
    }
}

function playAllActiveAudio() {
    document.querySelectorAll('.sound-card.active:not(.locked)').forEach(card => {
        startSound(card.getAttribute('data-sound'));
    });
}

function pauseAllActiveAudio() {
    Object.keys(activeSounds).forEach(stopSound);
}

soundCards.forEach(card => {
    card.addEventListener('click', () => {
        if (card.classList.contains('locked')) {
            alert('Unlock Zen Pro to access this soundscape!');
            return;
        }

        card.classList.toggle('active');
        const soundType = card.getAttribute('data-sound');

        // Sync active state across both grids
        document.querySelectorAll(`.sound-card[data-sound="${soundType}"]`).forEach(c => {
            c.classList.toggle('active', card.classList.contains('active'));
        });

        if (card.classList.contains('active')) {
            // Only play if timer is running
            if (timerId) startSound(soundType);
        } else {
            stopSound(soundType);
        }
    });
});

// --- Stats Logic ---
function updateDeviceStats() {
    document.getElementById('total-focus-time').innerText = `${Math.floor(totalFocusTime / 60)}h ${totalFocusTime % 60}m`;
    document.getElementById('sessions-completed').innerText = sessionsCompleted;

    const ua = navigator.userAgent;
    let browserName = "Unknown Browser";
    if (ua.indexOf("Chrome") > -1) browserName = "Chrome";
    else if (ua.indexOf("Safari") > -1) browserName = "Safari";
    else if (ua.indexOf("Firefox") > -1) browserName = "Firefox";

    document.getElementById('stat-device').innerText = navigator.platform || 'Unknown Device';
    document.getElementById('stat-screen').innerText = `${window.screen.width}x${window.screen.height}`;
    document.getElementById('stat-browser').innerText = browserName;
    document.getElementById('stat-platform').innerText = navigator.vendor || 'Standard Web';
}

// Burger Toggle
document.getElementById('burger-toggle').addEventListener('click', function() {
    const nav = document.getElementById('main-nav');
    nav.classList.toggle('open');
    this.innerText = nav.classList.contains('open') ? '✕' : '☰';
});

// Premium Pill Logic
document.getElementById('zen-upgrade')?.addEventListener('click', () => {
    alert('Redirecting to Stripe Checkout for Zen Pro ($4.99/mo)...');
});

// Theme Toggle Logic
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeBtn.innerText = isDark ? '☀️' : '🌙';
    });
}

// ========================================================
// STRATEGIC AD SYSTEM ENGINE (ZEN FOCUS EDITION)
// ========================================================

// 1. Rotating Bottom Banner Ad Pool
const FLOATING_ADS = [
    {
        badge: 'PRO SPONSOR',
        text: '🎧 <strong>AeroFlow ANC Headset:</strong> Block out all home office distractions. Use code <strong>ANC20</strong> for 20% off!',
        buttonText: 'Claim Deal',
        alertMsg: 'Redirecting to AeroFlow Store... Use code ANC20 at checkout for 20% off!'
    },
    {
        badge: 'BIOHACK',
        text: '🍄 <strong>FocusBrew Lion\'s Mane:</strong> Jitter-free clean focus coffee. Use code <strong>BREW15</strong> for 15% off.',
        buttonText: 'Try Now',
        alertMsg: 'Redirecting to FocusBrew Coffee... Your 15% discount has been applied!'
    },
    {
        badge: 'MINDFULNESS',
        text: '🧘 <strong>CalmApp Daily Breathwork:</strong> 5-minute stress decompressions. Try premium free today.',
        buttonText: 'Start Free',
        alertMsg: 'Opening CalmApp subscription page... Enjoy your 14-day free trial!'
    },
    {
        badge: 'DEEP WORK',
        text: '⌨️ <strong>ErgoFlow Keyboard:</strong> Whisper-quiet tactile mechanical keys optimized for programmers.',
        buttonText: 'Shop Now',
        alertMsg: 'Redirecting to ErgoFlow Store... Claim absolute workplace quietness.'
    },
    {
        badge: 'ZEN PRO',
        text: '✨ <strong>Zen Focus Pro:</strong> Unlock 50+ sleep soundscapes & full stat trackers. Only $1.99.',
        buttonText: 'Unlock Now',
        alertMsg: 'Opening Zen Focus Pro purchase... Upgrade lifetime access for just $1.99!'
    },
    {
        badge: 'FLOW STATE',
        text: '📖 <strong>Deep Work Handbook:</strong> Triple your focused output with our free 3-page guide.',
        buttonText: 'Download',
        alertMsg: 'Downloading your free 3-page Deep Work Handbook PDF...'
    }
];

// 2. Interchanging Full-Screen Recurring Pop-up Ad Pool
const POPUP_ADS = [
    {
        type: 'premium',
        badge: '🧘‍♂️',
        title: 'Zen Focus Pro',
        subtitle: 'LIMITED TIME UPGRADE OFFER',
        desc: 'Unlock 50+ HD binaural soundscapes, unlimited focus stat logs, and completely ad-free deep work forever.',
        promoText: 'Deal Expires In:',
        hasTimer: true,
        acceptBtnText: 'Unlock Pro ($2)',
        declineBtnText: 'Skip Offer',
        alertMsg: '🎉 Welcome to Zen Focus Pro! All ads have been successfully disabled.'
    },
    {
        type: 'sponsor',
        badge: '🍃',
        title: 'Mindfulness Daily',
        subtitle: 'SPONSORED PEAK FOCUS',
        desc: 'Reduce anxiety by 40% and master daily meditation guides. Access premium breathworks to start your day right.',
        promoText: 'SPECIAL CODE: CALM30 (30% OFF)',
        hasTimer: false,
        acceptBtnText: 'Get Started',
        declineBtnText: 'Skip Ad',
        alertMsg: 'Redirecting to CalmApp Store... Promo code: CALM30 applied successfully!'
    },
    {
        type: 'sponsor',
        badge: '🎧',
        title: 'AeroFlow Pro Headset',
        subtitle: 'SPONSORED PRODUCTIVITY',
        desc: 'Industry-leading hybrid active noise cancellation designed to lock you into absolute deep work, blocking 99.8% of noise.',
        promoText: 'GET $30 DIRECT CART DISCOUNT NOW',
        hasTimer: false,
        acceptBtnText: 'View Headset',
        declineBtnText: 'Close Ad',
        alertMsg: 'Redirecting to AeroFlow Store... Direct $30 cart discount claimed!'
    },
    {
        type: 'sponsor',
        badge: '☕',
        title: 'FocusBrew Coffee',
        subtitle: 'NATIVE BIOHACKING SPONSOR',
        desc: 'Micro-roasted coffee beans infused with organic Lion\'s Mane and L-Theanine for zero-jitter deep focus.',
        promoText: 'USE CODE "BREW20" FOR 20% OFF',
        hasTimer: false,
        acceptBtnText: 'Shop Brew',
        declineBtnText: 'No Thanks',
        alertMsg: 'Redirecting to FocusBrew Store... Use discount code: BREW20 at checkout!'
    },
    {
        type: 'sponsor',
        badge: '📖',
        title: 'Hyper-Focus Blueprint',
        subtitle: 'FREE DIRECT E-BOOK DOWNLOAD',
        desc: 'Learn the exact flow-state methods used by elite engineers and writers to triple daily outputs.',
        promoText: 'FREE PDF DOWNLOAD AVAILABLE NOW',
        hasTimer: false,
        acceptBtnText: 'Download E-Book',
        declineBtnText: 'Skip Guide',
        alertMsg: 'Downloading your free Hyper-Focus Blueprint PDF... Check your downloads!'
    }
];

// 3. Floating Banner Rotation Logic
const floatingAdBanner = document.getElementById('floating-ad-banner');
let currentAdIdx = 0;
let bannerRotationInterval = null;

function renderBannerAd(idx) {
    if (!floatingAdBanner || FLOATING_ADS.length === 0) return;
    const ad = FLOATING_ADS[idx];
    floatingAdBanner.innerHTML = `
        <div class="banner-content">
            <span class="banner-badge">${ad.badge}</span>
            <p>${ad.text}</p>
        </div>
        <div class="banner-actions">
            <button class="btn-banner-action" id="btn-banner-shop">${ad.buttonText}</button>
            <button class="btn-banner-close" id="btn-banner-close">&times;</button>
        </div>
    `;
}

function rotateFloatingAd() {
    if (!floatingAdBanner || floatingAdBanner.style.display === 'none') return;
    floatingAdBanner.classList.add('fade-out');
    setTimeout(() => {
        currentAdIdx = (currentAdIdx + 1) % FLOATING_ADS.length;
        renderBannerAd(currentAdIdx);
        floatingAdBanner.classList.remove('fade-out');
    }, 400);
}

// Slide-in the floating banner after 4 seconds
setTimeout(() => {
    if (floatingAdBanner) {
        renderBannerAd(currentAdIdx);
        floatingAdBanner.style.display = 'flex';
        bannerRotationInterval = setInterval(rotateFloatingAd, 10000);
    }
}, 4000);

// Safe Event Delegation for floating banner
if (floatingAdBanner) {
    floatingAdBanner.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'btn-banner-close') {
            floatingAdBanner.style.display = 'none';
            if (bannerRotationInterval) clearInterval(bannerRotationInterval);
        } else if (target.id === 'btn-banner-shop') {
            const activeAd = FLOATING_ADS[currentAdIdx];
            alert(activeAd.alertMsg);
            floatingAdBanner.style.display = 'none';
            if (bannerRotationInterval) clearInterval(bannerRotationInterval);
        }
    });
}

// 4. Recurring Interchanging Pop-up Modal Logic
const premiumUpgradeModal = document.getElementById('premiumUpgradeModal');
let activePopupIdx = 0;
let upgradeCountdownTimer = null;
let nextPopupTimeout = null;

function startPremiumCountdown() {
    let durationSeconds = 10 * 60; // 10 minutes
    const display = document.getElementById('premium-timer-display');
    if (!display) return;
    
    if (upgradeCountdownTimer) clearInterval(upgradeCountdownTimer);
    upgradeCountdownTimer = setInterval(() => {
        durationSeconds--;
        if (durationSeconds >= 0) {
            const mins = Math.floor(durationSeconds / 60);
            const secs = durationSeconds % 60;
            display.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            clearInterval(upgradeCountdownTimer);
            premiumUpgradeModal.style.display = 'none';
            scheduleNextPopup();
        }
    }, 1000);
}

function renderPopupAdContent(ad) {
    if (!premiumUpgradeModal) return;
    
    let promoHTML = ad.hasTimer
        ? `<div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); padding: 1.2rem; border-radius: 12px; margin-bottom: 2.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem;">
               <span style="font-size: 0.85rem; font-weight: 700; color: #888;">${ad.promoText}</span>
               <span id="premium-timer-display" style="font-family: monospace; font-size: 1.5rem; font-weight: 800; color: var(--accent);">10:00</span>
           </div>`
        : `<div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); padding: 1.2rem; border-radius: 12px; margin-bottom: 2.5rem; text-align: center;">
               <span style="font-size: 0.95rem; font-weight: 800; color: var(--accent); letter-spacing: 0.5px; text-transform: uppercase;">${ad.promoText}</span>
           </div>`;

    premiumUpgradeModal.innerHTML = `
        <div class="modal-content" style="max-width: 540px; text-align: center; border-color: rgba(0, 255, 204, 0.15); box-shadow: 0 0 40px rgba(0, 255, 204, 0.05);">
            <div class="celebration-badge" style="font-size: 4rem; animation: pulse 2s infinite; margin-bottom: 1rem;">${ad.badge}</div>
            <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 2.2rem; color: var(--accent); margin: 1rem 0 0.5rem; letter-spacing: -1px; text-transform: uppercase;">${ad.title}</h2>
            <p style="color: var(--muted); font-size: 0.85rem; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 1.5rem;">${ad.subtitle}</p>
            <p style="color: #ccc; font-size: 1.05rem; line-height: 1.6; margin-bottom: 2rem;">${ad.desc}</p>
            ${promoHTML}
            <div style="display: flex; gap: 1.5rem;">
                <button class="btn-secondary" id="btn-decline-upgrade" style="flex: 1; padding: 1rem;">${ad.declineBtnText}</button>
                <button class="btn-primary" id="btn-accept-upgrade" style="flex: 1; padding: 1rem;">${ad.acceptBtnText}</button>
            </div>
        </div>
    `;
    if (ad.hasTimer) startPremiumCountdown();
}

function triggerPopupAdFlow() {
    if (!premiumUpgradeModal || timerId) {
        // Retry in 30s if timer is currently running (guard active session focus)
        scheduleNextPopup(30000);
        return;
    }
    renderPopupAdContent(POPUP_ADS[activePopupIdx]);
    premiumUpgradeModal.style.display = 'flex';
}

function scheduleNextPopup(delayMs = 60000) {
    if (nextPopupTimeout) clearTimeout(nextPopupTimeout);
    nextPopupTimeout = setTimeout(() => {
        activePopupIdx = (activePopupIdx + 1) % POPUP_ADS.length;
        triggerPopupAdFlow();
    }, delayMs);
}

// Start recurring popup loop after 15 seconds
setTimeout(triggerPopupAdFlow, 15000);

// Event delegation on popup modal
if (premiumUpgradeModal) {
    premiumUpgradeModal.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'btn-decline-upgrade') {
            premiumUpgradeModal.style.display = 'none';
            if (upgradeCountdownTimer) clearInterval(upgradeCountdownTimer);
            scheduleNextPopup();
        } else if (target.id === 'btn-accept-upgrade') {
            const activeAd = POPUP_ADS[activePopupIdx];
            alert(activeAd.alertMsg);
            premiumUpgradeModal.style.display = 'none';
            if (upgradeCountdownTimer) clearInterval(upgradeCountdownTimer);
            
            if (activeAd.type === 'premium') {
                // Remove all ads for Zen Focus Pro Upgrade!
                if (floatingAdBanner) floatingAdBanner.style.display = 'none';
                if (bannerRotationInterval) clearInterval(bannerRotationInterval);
                if (nextPopupTimeout) clearTimeout(nextPopupTimeout);
                
                // Unlock Pro Soundscapes
                document.querySelectorAll('.sound-card.locked').forEach(card => {
                    card.classList.remove('locked');
                    card.style.opacity = '1';
                });
            } else {
                scheduleNextPopup();
            }
        }
    });
}

// 5. Interstitial Session Completion Skip-Ad
const interstitialModal = document.getElementById('interstitialAdModal');
const btnSkipAd = document.getElementById('btn-skip-ad');
const btnClaimAd = document.getElementById('btn-claim-ad');
let interstitialTimer = null;
let interstitialCallback = null;

function showSessionInterstitialAd(onClosed) {
    if (!interstitialModal) {
        onClosed();
        return;
    }
    
    interstitialCallback = onClosed;
    interstitialModal.style.display = 'flex';
    
    btnSkipAd.disabled = true;
    btnSkipAd.style.opacity = '0.4';
    btnSkipAd.style.cursor = 'not-allowed';
    btnSkipAd.innerText = 'Skip Ad in 5s';
    
    let count = 5;
    if (interstitialTimer) clearInterval(interstitialTimer);
    
    interstitialTimer = setInterval(() => {
        count--;
        if (count > 0) {
            btnSkipAd.innerText = `Skip Ad in ${count}s`;
        } else {
            clearInterval(interstitialTimer);
            btnSkipAd.innerText = 'Skip Ad';
            btnSkipAd.disabled = false;
            btnSkipAd.style.opacity = '1';
            btnSkipAd.style.cursor = 'pointer';
        }
    }, 1000);
}

if (btnSkipAd) {
    btnSkipAd.addEventListener('click', () => {
        interstitialModal.style.display = 'none';
        if (interstitialCallback) interstitialCallback();
    });
}

if (btnClaimAd) {
    btnClaimAd.addEventListener('click', () => {
        alert('🎉 Offer Claimed! Coupon code "ANC20" has been copied to your clipboard.');
        interstitialModal.style.display = 'none';
        if (interstitialCallback) interstitialCallback();
    });
}

// 6. Close Celebration Modal Handler
const btnCloseCelebration = document.getElementById('btn-close-celebration');
if (btnCloseCelebration) {
    btnCloseCelebration.addEventListener('click', () => {
        document.getElementById('celebrationModal').style.display = 'none';
    });
}

