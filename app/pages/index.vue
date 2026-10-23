<script setup>
import AppPreviews from '~/components/AppPreviews.vue';
import GrowTogether from '~/components/GrowTogether.vue';
import SiteHeader from '~/components/SiteHeader.vue';
import {
    BadgeCheck,
    Bell,
    Camera,
    CircleHelp,
    ClipboardList,
    Mic,
    TriangleAlert,
    Users,
} from "lucide-vue-next";

useHead({ title: "FarmBuddy" });

const features = [
    {
        icon: Camera,
        title: "Photo Diagnosis",
        desc: "Snap a photo of a sick plant or animal and get likely causes with a confidence level.",
    },
    {
        icon: Mic,
        title: "Voice Notes",
        desc: "Speak in your own language and get answers back, with no typing.",
    },
    {
        icon: CircleHelp,
        title: "Smart Questions",
        desc: "FarmBuddy asks a few quick questions first, so the advice fits your farm.",
    },
    {
        icon: ClipboardList,
        title: "Farm Records",
        desc: "Say what happened on the farm today and it is saved, with weekly profit and loss summaries.",
    },
    {
        icon: Bell,
        title: "Reminders",
        desc: "Never miss a vaccine, spraying, feeding, deworming, or harvest date.",
    },
    {
        icon: Users,
        title: "Farmer Network",
        desc: "Connect with nearby farmers, dealers, and buyers.",
    },
    {
        icon: TriangleAlert,
        title: "Outbreak Alerts",
        desc: "Get warned when a crop or animal disease is spreading near you.",
    },
    {
        icon: BadgeCheck,
        title: "Farm Passport",
        desc: "A verified farm record you can show banks, cooperatives, and buyers.",
    },
];

const heroHeadings = [
    "Farm Buddy for every crop and Farm Animals",
    "Farming help that speaks your language",
    "Smart AI Farm Assistance",
];

const marqueeItems = [
    "🌱 Snap a photo, get a diagnosis in minutes",
    "🐔 Crop and Farm Animal help in one app",
    "🎙️ Speak your farm records, no typing",
    "🩺 Real vet or agronomist backup when the AI is unsure",
    "⭐ Free to start",
];

// SSR renders the first heading fully; the client animates from there.
const displayedHeading = ref(heroHeadings[0]);
let timer = null;

function startTyping() {
    const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
    ).matches;
    let index = 0;

    if (reduced) {
        // No per-character motion: swap whole headings instead.
        timer = setInterval(() => {
            index = (index + 1) % heroHeadings.length;
            displayedHeading.value = heroHeadings[index];
        }, 3000);
        return;
    }

    let charIndex = heroHeadings[0].length;
    let erasing = false;

    const step = () => {
        if (erasing) {
            charIndex -= 1;
            displayedHeading.value = heroHeadings[index].slice(0, charIndex);
            if (charIndex <= 0) {
                erasing = false;
                index = (index + 1) % heroHeadings.length;
                timer = setTimeout(step, 400);
            } else {
                timer = setTimeout(step, 25);
            }
            return;
        }
        charIndex += 1;
        displayedHeading.value = heroHeadings[index].slice(0, charIndex);
        if (charIndex >= heroHeadings[index].length) {
            erasing = true;
            timer = setTimeout(step, 2200);
        } else {
            timer = setTimeout(step, 60);
        }
    };

    // First heading already shows fully: hold, then erase and move on.
    timer = setTimeout(() => {
        erasing = true;
        step();
    }, 2200);
}

onMounted(startTyping);
onUnmounted(() => {
    clearTimeout(timer);
    clearInterval(timer);
});
</script>

<template>
    <main id="home" class="flex min-h-screen flex-col">
        <!-- Marquee -->
        <div
            class="shrink-0 overflow-hidden bg-[#F9C23C] py-2.5 text-[#066136]"
        >
            <div class="fb-marquee flex w-max">
                <div
                    v-for="copy in 2"
                    :key="copy"
                    class="flex shrink-0"
                    :aria-hidden="copy === 2 ? 'true' : undefined"
                >
                    <template v-for="(item, i) in marqueeItems" :key="i">
                        <span class="pr-3 text-sm font-semibold">
                            {{ item }}
                        </span>
                        <span class="pr-3 text-sm" aria-hidden="true">·</span>
                    </template>
                </div>
            </div>
        </div>

        <!-- Hero -->
        <section
            class="relative isolate flex min-h-[calc(100vh-40px)] flex-1 flex-col justify-center overflow-hidden bg-[#F7F4EF] text-slate-900"
        >
            <SiteHeader class="w-full shrink-0" />

            <!-- Grid background -->
            <div
                class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(51,47,43,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(51,47,43,0.08)_1px,transparent_1px)] [background-size:48px_48px]"
                aria-hidden="true"
            />

            <!-- Decorative floating farm visuals -->
            <HeroFloaters />

            <div
                class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-10 sm:px-6 sm:py-12"
            >
                <div class="mx-auto w-full max-w-4xl text-center">
                    <p
                        class="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-900/10 bg-white/60 px-3 py-1.5 text-[11px] font-medium text-slate-700 sm:mb-6 sm:px-4 sm:text-sm"
                    >
                        🌱 Farm care, records, and community in one app
                    </p>
                    <h1
                        class="flex min-h-[108px] flex-col justify-center text-3xl font-bold tracking-tight text-[#066136] sm:min-h-[144px] sm:text-5xl lg:min-h-[120px] lg:text-6xl"
                    >
                        <span class="sr-only">{{
                            heroHeadings.join(". ")
                        }}</span>
                        <span class="text-balance" aria-hidden="true">
                            {{ displayedHeading
                            }}<span class="fb-caret">|</span>
                        </span>
                    </h1>
                    <p
                        class="mt-5 text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-lg"
                    >
                        FarmBuddy is the AI farm doctor, record keeper, and
                        farming community for every crop and every farm animals.
                        Snap a photo or send a voice note, and get clear advice,
                        simple records, and real expert help from FarmBuddy AI
                    </p>
                    <div
                        class="mt-10 grid w-full grid-cols-1 gap-4 sm:flex sm:justify-center sm:gap-4"
                    >
                        <a
                            href="#"
                            class="flex justify-center rounded-full bg-[#066136] px-9 py-4 text-base font-semibold text-white transition hover:opacity-90"
                        >
                            Start Free
                        </a>
                        <a
                            href="#"
                            class="flex justify-center rounded-full bg-[#F9C23C] px-9 py-4 text-base font-semibold text-[#066136] transition hover:opacity-90"
                        >
                            About us
                        </a>
                    </div>
                </div>
            </div>
        </section>

        <!-- Value proposition -->
        <section id="about" class="bg-white py-16 sm:py-24">
            <div class="mx-auto max-w-3xl px-5 text-center sm:px-6">
                <h2
                    class="text-2xl font-bold tracking-tight text-[#066136] sm:text-3xl lg:text-4xl"
                >
                    Everything your farm needs, in one app
                </h2>
                <p
                    class="mt-4 text-base leading-relaxed text-slate-600 sm:mt-5 sm:text-lg"
                >
                    Everything you need to keep your crops and animals healthy
                    and your farm running well, in one simple app.
                </p>
            </div>

            <AppPreviews />

            <!-- Feature grid -->
            <div
                class="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-5 px-5 sm:mt-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4"
            >
                <div
                    v-for="f in features"
                    :key="f.title"
                    class="flex flex-col items-center rounded-2xl border border-slate-900/[0.07] bg-white p-5 text-center shadow-[0_2px_12px_rgba(43,43,43,0.05)]"
                >
                    <span
                        class="flex h-12 w-12 items-center justify-center rounded-full bg-[#066136]/10 text-[#F9C23C]"
                    >
                        <component :is="f.icon" :size="22" aria-hidden="true" />
                    </span>
                    <h3 class="mt-4 text-base font-semibold text-slate-900">
                        {{ f.title }}
                    </h3>
                    <p class="mt-2 text-sm leading-relaxed text-slate-600">
                        {{ f.desc }}
                    </p>
                </div>
            </div>
        </section>
        <GrowTogether />
    </main>
</template>

<style scoped>
.fb-marquee {
    animation: fb-marquee-scroll 22s linear infinite;
}

@keyframes fb-marquee-scroll {
    from {
        transform: translateX(0);
    }
    to {
        transform: translateX(-50%);
    }
}

.fb-caret {
    margin-left: 1px;
    font-weight: 400;
    animation: fb-caret-blink 1s step-end infinite;
}

@keyframes fb-caret-blink {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .fb-marquee {
        animation: none;
    }
    .fb-caret {
        animation: none;
    }
}
</style>
