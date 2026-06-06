<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { MapPin, MessageCircle, Users, ArrowRight, ChevronDown } from 'lucide-vue-next';

const videoRef = ref(null);
const containerRef = ref(null);

const BENEFITS = [
    { icon: MapPin, title: 'No te pierdas', desc: 'Llega a todas las exposiciones y zonas de interés de manera directa, sin mirar mapas complicados.' },
    { icon: MessageCircle, title: 'Respuestas rápidas', desc: 'A través de la interfaz móvil, el robot puede responder dudas básicas sobre lo que estás viendo.' },
    { icon: Users, title: 'Convive con visitantes', desc: 'Se mueve a una velocidad cómoda y se detiene automáticamente si la sala está abarrotada.' },
    { icon: ArrowRight, title: 'Rutas temáticas', desc: 'Dile "Sorpréndeme" o pide una ruta en concreto y disfruta del recorrido curado por expertos.' },
];

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
        <!-- HERO — Scroll-driven video -->
        <div ref="containerRef" class="scroll-container">
            <div class="sticky-wrapper">
                <video ref="videoRef" src="/output.mp4" preload="auto" muted playsinline class="video-bg" />
                <div class="video-overlay" />

                <div class="relative z-10 text-center max-w-3xl px-6 text-foreground">
                    <h1 class="font-display text-[clamp(2.8rem,7.5vw,5.5rem)] font-medium tracking-tight leading-[0.97] mb-5 reveal"
                        style="animation-delay: 40ms">
                        Descubre cada rincón con <span class="text-primary">ArTEC</span>
                    </h1>

                    <p class="text-[clamp(1.05rem,2vw,1.2rem)] text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed reveal"
                        style="animation-delay: 120ms">
                        Explora exposiciones, museos y galerías de arte con nuestro asistente.
                    </p>

                    <p class="inline-block text-sm text-muted-foreground bg-background/60 backdrop-blur-sm border border-border rounded-sm px-4 py-3 reveal"
                        style="animation-delay: 200ms">
                        Para iniciar tu visita, escanea el código QR ubicado en el robot.
                    </p>
                </div>

                <div class="scroll-hint">
                    <span>Desplázate</span>
                    <ChevronDown class="w-4 h-4" />
                </div>
            </div>
        </div>

        <!-- SECCIÓN USUARIOS — amable, sin tecnicismos -->
        <section id="usuario" class="bg-background px-6 py-32">
            <div class="max-w-[68rem] mx-auto">

                <header class="text-center max-w-xl mx-auto mb-20 reveal">
                    <p class="eyebrow mb-4">Empieza tu visita</p>
                    <h2 class="font-display text-[clamp(2.2rem,5vw,3.25rem)] font-medium tracking-tight leading-[1.05] mb-4">
                        Tu acompañante de exposición
                    </h2>
                    <p class="text-muted-foreground text-lg leading-relaxed">
                        Interactuar con nuestro guía robótico es tan sencillo como usar tu teléfono móvil. Sin apps adicionales.
                    </p>
                </header>

                <!-- Pasos -->
                <div class="grid gap-px bg-border border border-border mb-24 sm:grid-cols-3">
                    <div class="bg-background p-8 reveal" style="animation-delay: 80ms">
                        <p class="font-display text-4xl font-medium text-primary mb-6 leading-none">01</p>
                        <h3 class="font-medium text-foreground text-lg mb-2 tracking-tight">Escanea su código</h3>
                        <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                            Acércate al robot y enfoca con la cámara de tu móvil el <b class="text-foreground font-medium">código QR</b>.
                        </p>
                    </div>
                    <div class="bg-background p-8 reveal" style="animation-delay: 160ms">
                        <p class="font-display text-4xl font-medium text-primary mb-6 leading-none">02</p>
                        <h3 class="font-medium text-foreground text-lg mb-2 tracking-tight">Chatea con él</h3>
                        <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                            Se abrirá un chat interactivo. Pídele que te lleve a una exposición específica, como
                            "La Sala de Da Vinci", o a los aseos más cercanos.
                            <b class="text-foreground font-medium">Pregunta lo que quieras!</b>
                        </p>
                    </div>
                    <div class="bg-background p-8 reveal" style="animation-delay: 240ms">
                        <p class="font-display text-4xl font-medium text-primary mb-6 leading-none">03</p>
                        <h3 class="font-medium text-foreground text-lg mb-2 tracking-tight">Sigue la ruta</h3>
                        <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                            El robot iniciará su marcha adaptándose a tu paso, esquivando a otras personas y
                            llevándote directamente <b class="text-foreground font-medium">a tu destino</b>.
                        </p>
                    </div>
                </div>

                <!-- Beneficios -->
                <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div v-for="(benefit, i) in BENEFITS" :key="benefit.title" class="text-center reveal"
                        :style="{ animationDelay: `${320 + i * 80}ms` }">
                        <div class="w-12 h-12 mx-auto mb-5 border border-border rounded-sm flex items-center justify-center text-primary">
                            <component :is="benefit.icon" class="w-5 h-5" />
                        </div>
                        <h4 class="font-medium text-foreground mb-1.5">{{ benefit.title }}</h4>
                        <p class="text-muted-foreground text-sm leading-relaxed">{{ benefit.desc }}</p>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* Scroll-driven hero video — kept as scoped CSS for the sticky/overlay
   mechanics that Tailwind utilities can't express cleanly. */
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
}

.video-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom,
            color-mix(in srgb, var(--color-background) 20%, transparent) 0%,
            color-mix(in srgb, var(--color-background) 70%, transparent) 60%,
            var(--color-background) 100%);
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
    color: var(--color-muted-foreground);
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .05em;
    animation: scrollBounce 2s ease-in-out infinite;
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
</style>
