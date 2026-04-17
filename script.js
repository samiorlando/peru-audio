// ==========================================
// CONFIGURACIÓN DEL STREAM - CENTOVA CAST
// ==========================================
const STREAM_URL = 'https://sonic.dattassd.com/8132/stream';
const METADATA_URL = 'https://sonic.dattassd.com/cp/get_info.php?p=8132';

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentSlide = 0;
let sliderInterval;
let progressInterval;
const totalSlides = 5;
let isPlaying = false;
let audioElement = document.getElementById('audioPlayer');
let currentTrack = { title: 'Esperando...', artist: 'Radio Huayno' };
let lastTrackKey = '';
let songHistory = [];
let metadataInterval;
let fetchTimeout;
let lastListenerCount = 0;

// ==========================================
// SLIDER FUNCIONALIDAD
// ==========================================
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.slider-dot');
const progressBar = document.getElementById('sliderProgress');
const slideDuration = 5000;

function goToSlide(index) {
    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');
    currentSlide = index;
    if (currentSlide >= totalSlides) currentSlide = 0;
    if (currentSlide < 0) currentSlide = totalSlides - 1;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
    resetProgress();
}

function nextSlide() { goToSlide(currentSlide + 1); }
function prevSlide() { goToSlide(currentSlide - 1); }

function resetProgress() {
    progressBar.style.width = '0%';
    clearInterval(sliderInterval);
    clearInterval(progressInterval);
    let elapsed = 0;
    const step = 50;
    progressInterval = setInterval(() => {
        elapsed += step;
        const percent = (elapsed / slideDuration) * 100;
        progressBar.style.width = percent + '%';
        if (elapsed >= slideDuration) clearInterval(progressInterval);
    }, step);
    sliderInterval = setInterval(nextSlide, slideDuration);
}

dots.forEach(dot => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.slide)));
});

document.getElementById('nextSlide').addEventListener('click', () => {
    nextSlide(); clearInterval(sliderInterval); clearInterval(progressInterval); resetProgress();
});

document.getElementById('prevSlide').addEventListener('click', () => {
    prevSlide(); clearInterval(sliderInterval); clearInterval(progressInterval); resetProgress();
});

resetProgress();

// ==========================================
// NAVEGACIÓN
// ==========================================
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    navMenu.classList.toggle('open');
});

document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('open');
        document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});

window.addEventListener('scroll', () => {
    const header = document.getElementById('header');
    header.classList.toggle('scrolled', window.scrollY > 50);
});

// ==========================================
// REPRODUCTOR STREAMING
// ==========================================
const btnPlay = document.getElementById('btnPlay');
const playIcon = document.getElementById('playIcon');
const playerCover = document.getElementById('playerCover');
const volumeSlider = document.getElementById('volumeSlider');
const volumeIcon = document.getElementById('volumeIcon');
const btnMute = document.getElementById('btnMute');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const listenerCountEl = document.getElementById('listenerCount');
const currentSongEl = document.getElementById('currentSong');
const currentArtistEl = document.getElementById('currentArtist');

audioElement.volume = 0.8;

function togglePlay() {
    if (isPlaying) {
        audioElement.pause();
        playIcon.className = 'fas fa-play';
        playerCover.classList.remove('spinning');
        isPlaying = false;
    } else {
        audioElement.src = STREAM_URL;
        audioElement.play().then(() => {
            playIcon.className = 'fas fa-pause';
            playerCover.classList.add('spinning');
            isPlaying = true;
            startMetadataPolling();
        }).catch(err => {
            console.log('Error al reproducir:', err);
            trackTitle.textContent = 'Error de conexión';
            trackArtist.textContent = 'Verifica tu conexión';
        });
    }
}

btnPlay.addEventListener('click', togglePlay);

volumeSlider.addEventListener('input', (e) => {
    const vol = e.target.value / 100;
    audioElement.volume = vol;
    volumeIcon.className = vol === 0 ? 'fas fa-volume-mute' : vol < 0.5 ? 'fas fa-volume-down' : 'fas fa-volume-up';
});

btnMute.addEventListener('click', () => {
    if (audioElement.volume > 0) {
        audioElement.volume = 0; volumeSlider.value = 0; volumeIcon.className = 'fas fa-volume-mute';
    } else {
        audioElement.volume = 0.8; volumeSlider.value = 80; volumeIcon.className = 'fas fa-volume-up';
    }
});

// ==========================================
// 🎯 PARSEADOR DE HISTORIA CENTOVA CAST
// ==========================================
function parseCurrentSongFromHistory(historyArray) {
    if (!Array.isArray(historyArray)) return null;
    
    for (let entry of historyArray) {
        if (!entry || typeof entry !== 'string') continue;
        
        // Limpiar formato "2.) 036. Artista - Título"
        let cleaned = entry.replace(/^\d+\.\)\s*/, '').trim();
        if (!cleaned || cleaned.length < 3) continue;
        
        // Remover números de pista como "036. "
        cleaned = cleaned.replace(/^\d{2,3}\.\s*/, '').trim();
        
        if (cleaned.includes(' - ')) {
            const parts = cleaned.split(' - ');
            return { 
                title: parts.pop().trim(), 
                artist: parts.join(' - ').trim() 
            };
        }
        return { title: cleaned, artist: '' };
    }
    return null;
}

// ==========================================
// 📜 GESTIÓN DEL HISTORIAL
// ==========================================
function addToHistory(title, artist) {
    if (!title || title === currentTrack.title) return;
    
    const now = new Date();
    songHistory.unshift({
        title,
        artist: artist || 'Radio Huayno',
        time: 'Ahora',
        timestamp: now.getTime()
    });
    
    if (songHistory.length > 8) songHistory.pop();
    updateHistoryTimes();
    renderHistory();
    console.log('📜 Historial actualizado:', title, '-', artist);
}

function updateHistoryTimes() {
    songHistory.forEach((song, i) => {
        if (i === 0) song.time = 'Ahora';
        else song.time = `Hace ${i * 5} min`;
    });
}

function renderHistory() {
    const timeline = document.getElementById('historyTimeline');
    if (!timeline) return;
    
    let html = `
        <div class="news-item current">
            <div class="date">Reproduciendo ahora</div>
            <h3><i class="fas fa-music"></i> <span id="currentSong">${currentTrack.title}</span></h3>
            <p><span id="currentArtist">${currentTrack.artist}</span></p>
        </div>
    `;
    
    songHistory.forEach((song, i) => {
        if (i === 0) return; // Skip first, it's already in "current"
        html += `
            <div class="news-item">
                <div class="date">${song.time}</div>
                <h3><i class="fas fa-music"></i> ${song.title}</h3>
                <p>${song.artist ? '🎤 ' + song.artist : ''}</p>
            </div>
        `;
    });
    
    timeline.innerHTML = html;
}

// ==========================================
// 🔄 POLLING DE METADATA & OYENTES
// ==========================================
function startMetadataPolling() {
    fetchMetadata();
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(fetchMetadata, 5000); // Cada 5 segundos
}

function stopMetadataPolling() {
    if (metadataInterval) clearInterval(metadataInterval);
    if (fetchTimeout) clearTimeout(fetchTimeout);
}

async function fetchMetadata() {
    if (!METADATA_URL || !isPlaying) return;
    
    fetchTimeout = setTimeout(() => console.log('⏱️ Timeout meta'), 5000);
    
    try {
        const response = await fetch(METADATA_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json, text/plain, */*', 'Cache-Control': 'no-cache' },
            mode: 'cors'
        });
        
        clearTimeout(fetchTimeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        let data;
        const ct = response.headers.get('content-type');
        if (ct?.includes('application/json')) data = await response.json();
        else {
            const text = await response.text();
            try { data = JSON.parse(text); } catch { data = {}; }
        }
        
        // 🔍 Extraer canción actual del historial
        const currentSong = parseCurrentSongFromHistory(data.history);
        if (currentSong) {
            const trackKey = `${currentSong.artist} - ${currentSong.title}`;
            
            // 🆕 Si cambió la canción, actualizar
            if (trackKey !== lastTrackKey) {
                // Guardar canción anterior en historial
                if (lastTrackKey && currentTrack.title !== 'Esperando...') {
                    addToHistory(currentTrack.title, currentTrack.artist);
                }
                
                // Actualizar canción actual
                currentTrack = { title: currentSong.title, artist: currentSong.artist };
                lastTrackKey = trackKey;
                
                // Actualizar UI del player
                trackTitle.textContent = currentSong.title;
                trackArtist.textContent = currentSong.artist;
                if (currentSongEl) currentSongEl.textContent = currentSong.title;
                if (currentArtistEl) currentArtistEl.textContent = currentSong.artist;
                
                console.log('🎵 Cambio detectado:', currentSong.artist, '-', currentSong.title);
            }
        }
        
        // 👥 Actualizar oyentes en tiempo real
        const listeners = parseInt(data.listeners || data.ulistener || 0);
        if (listeners >= 0) updateListenerCountRealTime(listeners);
        
    } catch (error) {
        console.log('⚠️ Error meta:', error.message);
    }
}

function updateListenerCountRealTime(newCount) {
    if (!listenerCountEl) return;
    const target = parseInt(newCount) || 0;
    
    if (lastListenerCount === 0) {
        listenerCountEl.textContent = target.toLocaleString();
        lastListenerCount = target;
        return;
    }
    
    const steps = 15;
    let step = 0;
    const inc = (target - lastListenerCount) / steps;
    
    const animate = () => {
        step++;
        listenerCountEl.textContent = Math.round(lastListenerCount + (inc * step)).toLocaleString();
        if (step < steps) requestAnimationFrame(animate);
        else {
            listenerCountEl.textContent = target.toLocaleString();
            lastListenerCount = target;
        }
    };
    requestAnimationFrame(animate);
}

// ==========================================
// 🎬 VIDEOS YOUTUBE
// ==========================================
function openVideo(videoId) {
    document.getElementById('youtubeFrame').src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    document.getElementById('videoModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVideo() {
    document.getElementById('youtubeFrame').src = '';
    document.getElementById('videoModal').classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideo(); });
document.getElementById('videoModal').addEventListener('click', e => { if (e.target.id === 'videoModal') closeVideo(); });

// ==========================================
// 🎨 ANIMACIONES Y SCROLL
// ==========================================
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function(e) {
        e.preventDefault();
        const t = document.querySelector(this.getAttribute('href'));
        if (t) window.scrollTo({ top: t.offsetTop - document.querySelector('.header').offsetHeight - 20, behavior: 'smooth' });
    });
});

// ==========================================
// 🚀 INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('%c🎙️ Radio Huayno Sureño 2026', 'color: #8b5cf6; font-size: 18px; font-weight: bold;');
    console.log('%c📡 Stream activo', 'color: #10b981;');
    console.log('%c📜 Historial de reproducción: HABILITADO', 'color: #f59e0b;');
    renderHistory();
});

window.addEventListener('beforeunload', () => {
    stopMetadataPolling();
    if (audioElement) audioElement.pause();
});