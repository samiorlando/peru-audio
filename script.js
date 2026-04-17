// ==========================================
// CONFIGURACIÓN DEL STREAM
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
let previousTrack = { title: '', artist: '' };
let songHistory = [];
let metadataInterval;
let fetchTimeout;
let lastListenerCount = 0;

// ==========================================
// SLIDER
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
        progressBar.style.width = (elapsed / slideDuration * 100) + '%';
        if (elapsed >= slideDuration) clearInterval(progressInterval);
    }, step);
    sliderInterval = setInterval(nextSlide, slideDuration);
}

dots.forEach(dot => dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.slide))));
document.getElementById('nextSlide').addEventListener('click', () => { nextSlide(); clearInterval(sliderInterval); clearInterval(progressInterval); resetProgress(); });
document.getElementById('prevSlide').addEventListener('click', () => { prevSlide(); clearInterval(sliderInterval); clearInterval(progressInterval); resetProgress(); });
resetProgress();

// ==========================================
// NAVEGACIÓN
// ==========================================
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
menuToggle.addEventListener('click', () => { menuToggle.classList.toggle('active'); navMenu.classList.toggle('open'); });
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('open');
        document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});
window.addEventListener('scroll', () => document.getElementById('header').classList.toggle('scrolled', window.scrollY > 50));

// ==========================================
// REPRODUCTOR
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
            console.log('🎵 Stream conectado');
            startMetadataPolling();
        }).catch(err => {
            console.log('❌ Error:', err);
            trackTitle.textContent = 'Error de conexión';
            trackArtist.textContent = 'Verifica tu red';
        });
    }
}
btnPlay.addEventListener('click', togglePlay);

volumeSlider.addEventListener('input', e => {
    const v = e.target.value / 100;
    audioElement.volume = v;
    volumeIcon.className = v === 0 ? 'fas fa-volume-mute' : v < 0.5 ? 'fas fa-volume-down' : 'fas fa-volume-up';
});

btnMute.addEventListener('click', () => {
    if (audioElement.volume > 0) { audioElement.volume = 0; volumeSlider.value = 0; volumeIcon.className = 'fas fa-volume-mute'; }
    else { audioElement.volume = 0.8; volumeSlider.value = 80; volumeIcon.className = 'fas fa-volume-up'; }
});

// ==========================================
// 📜 SISTEMA DE HISTORIAL - CORREGIDO Y ROBUSTO
// ==========================================

/**
 * Extrae la canción actual de cualquier formato de Centova Cast
 */
function extractSong(data) {
    if (!data) return null;
    
    console.log('🔍 Datos recibidos de la API:', JSON.stringify(data, null, 2));
    
    // 1️⃣ Intentar campo 'title' directo
    if (data.title && data.title.trim()) {
        let raw = data.title.trim();
        // Limpiar números de pista
        raw = raw.replace(/^\d{2,3}\.\s*/, '');
        if (raw.includes(' - ')) {
            const parts = raw.split(' - ');
            return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
        }
        return { artist: data.artist || data.song_artist || '', title: raw };
    }
    
    // 2️⃣ Intentar campo 'songtitle'
    if (data.songtitle && data.songtitle.trim()) {
        let raw = data.songtitle.trim().replace(/^\d{2,3}\.\s*/, '');
        if (raw.includes(' - ')) {
            const parts = raw.split(' - ');
            return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
        }
        return { artist: data.artist || '', title: raw };
    }
    
    // 3️⃣ Intentar array 'history' (formato común de Centova)
    if (Array.isArray(data.history)) {
        for (let entry of data.history) {
            if (!entry || typeof entry !== 'string') continue;
            let cleaned = entry.replace(/^\d+\.\)\s*/, '').trim();
            if (!cleaned || cleaned.length < 5) continue;
            cleaned = cleaned.replace(/^\d{2,3}\.\s*/, '').trim();
            if (cleaned.includes(' - ')) {
                const parts = cleaned.split(' - ');
                return { title: parts.pop().trim(), artist: parts.join(' - ').trim() };
            }
            return { title: cleaned, artist: '' };
        }
    }
    
    // 4️⃣ Intentar objeto 'currentsong'
    if (data.currentsong) {
        return {
            title: data.currentsong.title || data.currentsong.name || '',
            artist: data.currentsong.artist || data.currentsong.singer || ''
        };
    }
    
    // 5️⃣ Intentar 'now_playing'
    if (data.now_playing) {
        return {
            title: data.now_playing.title || '',
            artist: data.now_playing.artist || ''
        };
    }
    
    return null;
}

/**
 * Actualiza el historial de reproducción
 */
function updateHistory(title, artist) {
    // Limpiar
    const cleanTitle = (title || 'Desconocido').trim();
    const cleanArtist = (artist || 'Radio Huayno').trim();
    
    // Verificar si cambió la canción
    const currentKey = `${cleanArtist} - ${cleanTitle}`;
    const previousKey = `${previousTrack.artist} - ${previousTrack.title}`;
    
    if (currentKey === previousKey || !cleanTitle || cleanTitle === 'Desconocido') {
        return; // No cambió, no hacer nada
    }
    
    console.log('🔄 Cambio de canción detectado!');
    console.log('  Anterior:', previousKey);
    console.log('  Nueva:', currentKey);
    
    // Si hay una canción anterior, moverla al historial
    if (previousTrack.title && previousTrack.title !== 'Esperando...') {
        songHistory.unshift({
            title: previousTrack.title,
            artist: previousTrack.artist,
            time: 'Hace un momento',
            timestamp: Date.now()
        });
        
        // Mantener máximo 10 canciones
        if (songHistory.length > 10) songHistory.pop();
        
        console.log('📜 Agregado al historial:', previousTrack.title, '-', previousTrack.artist);
    }
    
    // Actualizar canción actual
    previousTrack = { title: cleanTitle, artist: cleanArtist };
    currentTrack = { title: cleanTitle, artist: cleanArtist };
    
    // Actualizar UI del player
    trackTitle.textContent = cleanTitle;
    trackArtist.textContent = cleanArtist;
    
    // Actualizar historial visual
    renderHistoryTimeline();
}

/**
 * Renderiza el timeline de historial en el HTML
 */
function renderHistoryTimeline() {
    const timeline = document.getElementById('historyTimeline');
    if (!timeline) return;
    
    let html = '';
    
    // Canción actual (siempre primero)
    html += `
        <div class="news-item current">
            <div class="date">🔴 Reproduciendo ahora</div>
            <h3><i class="fas fa-music"></i> ${currentTrack.title || 'Esperando...'}</h3>
            <p>🎤 ${currentTrack.artist || 'Radio Huayno'}</p>
        </div>
    `;
    
    // Canciones anteriores
    songHistory.forEach((song, i) => {
        const timeLabel = i === 0 ? 'Hace un momento' : i === 1 ? 'Hace 5 min' : i === 2 ? 'Hace 10 min' : `Hace ${15 + (i-3)*5} min`;
        html += `
            <div class="news-item">
                <div class="date">${timeLabel}</div>
                <h3><i class="fas fa-music"></i> ${song.title}</h3>
                <p>🎤 ${song.artist}</p>
            </div>
        `;
    });
    
    // Si no hay historial, mostrar mensaje
    if (songHistory.length === 0) {
        html += `
            <div class="news-item">
                <div class="date">Esperando siguiente canción...</div>
                <h3><i class="fas fa-clock"></i> El historial se actualizará cuando cambie la canción</h3>
                <p>🎵 Conéctate al stream para ver las canciones reproducidas</p>
            </div>
        `;
    }
    
    timeline.innerHTML = html;
    console.log('📜 Historial renderizado:', songHistory.length + 1, 'canciones');
}

// ==========================================
// 🔄 POLLING DE METADATA
// ==========================================
function startMetadataPolling() {
    console.log('🔄 Iniciando polling de metadata...');
    fetchMetadata(); // Primera llamada inmediata
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(fetchMetadata, 5000); // Cada 5 segundos
}

function stopMetadataPolling() {
    if (metadataInterval) clearInterval(metadataInterval);
    if (fetchTimeout) clearTimeout(fetchTimeout);
}

async function fetchMetadata() {
    if (!METADATA_URL || !isPlaying) return;
    
    fetchTimeout = setTimeout(() => console.log('⏱️ Timeout'), 5000);
    
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
        
        // Extraer canción
        const song = extractSong(data);
        if (song) {
            updateHistory(song.title, song.artist);
            console.log('✅ Metadata:', song.artist, '-', song.title);
        } else {
            console.log('⚠️ No se pudo extraer la canción. Verifica la estructura de la API.');
        }
        
        // 👥 Oyentes
        const listeners = parseInt(data.listeners || data.ulistener || 0);
        if (listeners >= 0 && listenerCountEl) {
            listenerCountEl.textContent = listeners.toLocaleString();
            lastListenerCount = listeners;
        }
        
    } catch (error) {
        console.log('❌ Error fetching metadata:', error.message);
    }
}

// ==========================================
// 🎬 YOUTUBE
// ==========================================
function openVideo(id) {
    document.getElementById('youtubeFrame').src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
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
// 🎨 SCROLL & ANIMACIONES
// ==========================================
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(entries => {
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
    console.log('%c📡 Stream configurado', 'color: #10b981;');
    console.log('%c📜 Sistema de historial: HABILITADO', 'color: #f59e0b;');
    console.log('%c💡 Haz clic en ▶️ para iniciar y ver el historial en acción', 'color: #94a3b8;');
    renderHistoryTimeline(); // Render inicial
});

window.addEventListener('beforeunload', () => { stopMetadataPolling(); if (audioElement) audioElement.pause(); });
// ==========================================
// 📅 PROGRAMACIÓN AUTO-ACTUALIZABLE
// ==========================================

/**
 * Convierte "HH:MM" (24h) a minutos desde medianoche
 */
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
}

/**
 * Actualiza automáticamente la clase .live y el badge "AL AIRE"
 */
function updateProgramacionAuto() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const items = document.querySelectorAll('.programacion-item');
    let liveFound = false;

    items.forEach(item => {
        const startStr = item.getAttribute('data-start');
        const endStr = item.getAttribute('data-end');
        if (!startStr || !endStr) return;

        const startMin = timeToMinutes(startStr);
        const endMin = timeToMinutes(endStr);

        // Determinar si está en vivo (maneja cruce de medianoche)
        let isLive = false;
        if (endMin > startMin) {
            isLive = currentMinutes >= startMin && currentMinutes < endMin;
        } else {
            // Programa que cruza medianoche (ej: 22:00 - 06:00)
            isLive = currentMinutes >= startMin || currentMinutes < endMin;
        }

        if (isLive) {
            item.classList.add('live');
            liveFound = true;
            
            // Insertar/actualizar badge si no existe
            let badge = item.querySelector('.prog-live-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'prog-live-badge';
                item.appendChild(badge);
            }
            badge.innerHTML = '<i class="fas fa-circle"></i> AL AIRE';
            
            // Scroll suave al programa en vivo (solo la primera vez que cambia)
            if (!item.dataset.scrolled) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                item.dataset.scrolled = 'true';
            }
        } else {
            item.classList.remove('live');
            item.removeAttribute('data-scrolled');
            const badge = item.querySelector('.prog-live-badge');
            if (badge) badge.remove();
        }
    });

    if (!liveFound) {
        console.log('📡 Programación: Fuera de horario programado');
    }
}

// Ejecutar al cargar y actualizar cada 60 segundos
document.addEventListener('DOMContentLoaded', () => {
    updateProgramacionAuto();
    setInterval(updateProgramacionAuto, 60000); // Cada 1 minuto
});