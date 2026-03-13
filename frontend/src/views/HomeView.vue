<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const videoRef = ref(null);
const containerRef = ref(null);

const handleScroll = () => {
    if (!videoRef.value || !containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    const scrollTop = -rect.top;
    const totalHeight = containerRef.value.scrollHeight - window.innerHeight;
    const scrollFraction = Math.max(0, Math.min(scrollTop / totalHeight, 1));
    if (videoRef.value.duration) {
        videoRef.value.currentTime = videoRef.value.duration * scrollFraction;
    }
};

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
</script>

<template>
    <div>
        <!-- ════════════════════════════════════════════
       HERO — Scroll-driven video
       ════════════════════════════════════════════ -->
        <div ref="containerRef" class="scroll-container">
            <div class="sticky-wrapper">
                <video ref="videoRef" src="/output.mp4" preload="auto" muted playsinline class="video-bg" />
                <div class="video-overlay" />

                <div class="hero-content">

                    <h1 class="hero-title">
                        Descubre cada rincón con
                        <span class="hero-title-accent">ArTEC</span>
                    </h1>

                    <p class="hero-subtitle">
                        Explora exposiciones, museos y galerías de arte con nuestro asistente.
                    </p>

                    <div class="hero-actions">
                        <a href="#usuario" class="btn-primary">
                            Aprende a usarlo
                            <svg class="btn-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </a>
                    </div>
                </div>

                <div class="scroll-hint">
                    <span>Desplázate</span>
                    <svg class="scroll-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        </div>

        <!-- ════════════════════════════════════════════
       SECTION USUARIOS — friendly, no-tech
       ════════════════════════════════════════════ -->
        <section id="usuario" class="user-section">
            <div class="section-inner">

                <!-- Intro -->
                <div class="section-header">
                    <span class="section-tag">Empieza tu visita</span>
                    <h2 class="section-title">Tu acompañante de exposición</h2>
                    <p class="section-desc">
                        Interactuar con nuestro guía robótico es tan sencillo como usar tu teléfono móvil. Sin apps
                        adicionales.
                    </p>
                </div>

                <!-- Steps -->
                <div class="steps-grid">
                    <div class="step-card bg-white">
                        <div class="step-num">01</div>
                        <h3>Escanea su código</h3>
                        <p>Acércate al robot y enfoca con la cámara de tu móvil el <b>código QR</b>.</p>
                    </div>
                    <div class="step-card bg-white">
                        <div class="step-num">02</div>
                        <h3>Chatea con él</h3>
                        <p>Se abrirá un chat interactivo. Pídele que te lleve a una exposición específica, como "La Sala
                            de
                            Da Vinci", o a los aseos más cercanos. <b>Pregunta lo que quieras!</b></p>
                    </div>
                    <div class="step-card bg-white">
                        <div class="step-num">03</div>
                        <h3>Sigue la ruta</h3>
                        <p>El robot iniciará su marcha adaptándose a tu paso, esquivando a otras personas y llevándote
                            directamente <b>a tu destino</b>.</p>
                    </div>
                </div>

                <div class="benefits-row">
                    <div class="benefit-item">
                        <div class="benefit-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z">
                                </path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                        </div>
                        <h4>No te pierdas</h4>
                        <p>Llega a todas las exposiciones y zonas de interés de manera directa, sin mirar mapas
                            complicados.
                        </p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z">
                                </path>
                            </svg>
                        </div>
                        <h4>Respuestas rápidas</h4>
                        <p>A través de la interfaz movil, el robot puede responder dudas básicas sobre lo que estas
                            viendo
                        </p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z">
                                </path>
                            </svg>
                        </div>
                        <h4>Convive con visitantes</h4>
                        <p>Se mueve a una velocidad cómoda y se detiene automáticamente si la sala está abarrotada.</p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                    d="M5 12h14M12 5l7 7-7 7"></path>
                            </svg>
                        </div>
                        <h4>Rutas temáticas</h4>
                        <p>Dile "Sorpréndeme" o pide una ruta en concreto y disfruta del recorrido curado por expertos.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* ─────────────────────────────── HERO / VIDEO ─── */
.scroll-container {
    height: 350vh;
    background: var(--color-background);
}

.sticky-wrapper {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
}

.video-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.85;
    /* Lighten the video to fit white theme */
}

/* Light gradient overlay to ensure text is readable but kept luminous */
.video-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom,
            rgba(255, 255, 255, 0.2) 0%,
            rgba(255, 255, 255, 0.7) 60%,
            rgba(255, 255, 255, 1) 100%);
}

:is(.dark) .video-overlay {
    background: linear-gradient(to bottom,
            rgba(2, 6, 23, 0.2) 0%,
            rgba(2, 6, 23, 0.7) 60%,
            rgba(2, 6, 23, 1) 100%);
}

.hero-content {
    position: relative;
    z-index: 10;
    text-align: center;
    max-width: 56rem;
    padding: 0 1.5rem;
    color: var(--color-foreground);
}

.hero-eyebrow {
    text-transform: uppercase;
    letter-spacing: .18em;
    font-size: .8rem;
    font-weight: 700;
    color: var(--color-blue-600);
    margin-bottom: 1rem;
}

.hero-title {
    font-size: clamp(2.8rem, 7.5vw, 5.5rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.04;
    margin-bottom: 1.25rem;
}

.hero-title-accent {
    color: var(--color-blue-600);
}

.hero-subtitle {
    font-size: clamp(1.1rem, 2vw, 1.3rem);
    color: var(--color-muted-foreground);
    max-width: 38rem;
    margin: 0 auto 2.5rem;
    line-height: 1.6;
    font-weight: 500;
}

.hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    padding: 0.9rem 2rem;
    background: var(--color-blue-600);
    color: #fff;
    font-weight: 600;
    font-size: 1.05rem;
    border-radius: 9999px;
    /* Pill shape like Apple/Google */
    text-decoration: none;
    transition: all .2s ease;
    box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
}

.btn-primary:hover {
    background: #1d4ed8;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45);
}

.btn-arrow {
    width: 1.1rem;
    height: 1.1rem;
    transition: transform .2s;
}

.btn-primary:hover .btn-arrow {
    transform: translateX(4px);
}

.scroll-hint {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .25rem;
    color: var(--color-slate-400);
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .05em;
    animation: scrollBounce 2s ease-in-out infinite;
}

.scroll-chevron {
    width: 1.2rem;
    height: 1.2rem;
}

@keyframes scrollBounce {

    0%,
    100% {
        transform: translateX(-50%) translateY(0);
    }

    50% {
        transform: translateX(-50%) translateY(7px);
    }
}

/* ────────────────────────────── SHARED LAYOUT ─── */
.section-inner {
    max-width: 68rem;
    margin: 0 auto;
}

.section-header {
    text-align: center;
    margin-bottom: 5rem;
}

.section-tag {
    display: inline-block;
    background: var(--color-blue-50);
    color: var(--color-blue-700);
    font-size: .75rem;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    padding: .4rem 1rem;
    border-radius: 9999px;
    margin-bottom: 1.5rem;
}

.section-title {
    font-size: clamp(2.2rem, 5vw, 3.5rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--color-foreground);
    margin-bottom: 1rem;
    line-height: 1.1;
}

.section-desc {
    color: var(--color-muted-foreground);
    font-size: 1.2rem;
    max-width: 42rem;
    margin: 0 auto;
    line-height: 1.6;
}

/* ─────────────────────────── SECTION USUARIOS ─── */
.user-section {
    background: var(--color-background);
    padding: 8rem 1.5rem;
}

.steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    margin-bottom: 6rem;
}

.step-card {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 1.5rem;
    padding: 2.5rem;
    transition: all .3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
}

.step-card:hover {
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
    transform: translateY(-4px);
    border-color: var(--color-blue-100);
}

.step-num {
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--color-blue-600);
    line-height: 1;
    margin-bottom: 1.5rem;
}

.step-card h3 {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--color-foreground);
    margin-bottom: 0.75rem;
    letter-spacing: -0.02em;
}

.step-card p {
    color: var(--color-muted-foreground);
    font-size: 1.05rem;
    line-height: 1.6;
}

.benefits-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 3rem;
}

.benefit-item {
    text-align: center;
}

.benefit-icon {
    width: 4rem;
    height: 4rem;
    background: var(--color-blue-50);
    border-radius: 1rem;
    /* Squircle look */
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
    color: var(--color-blue-600);
}

.benefit-icon svg {
    width: 2rem;
    height: 2rem;
}

.benefit-item h4 {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--color-foreground);
    margin-bottom: 0.5rem;
}

.benefit-item p {
    color: var(--color-muted-foreground);
    font-size: 0.95rem;
    line-height: 1.6;
}
</style>
