<script setup>
import ContactSection from '~/components/ContactSection.vue';
import SiteFooter from '~/components/SiteFooter.vue';
import HowItWorks from '~/components/HowItWorks.vue';
import FarmToolkit from '~/components/FarmToolkit.vue';
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

useHead({
    title: "FarmBuddy | Smart Farming Management System",
    meta: [{ name: "description", content: "Manage crops, livestock, farm records, bookkeeping, inventory, and your team with FarmBuddy, a smart farming management system with marketplace connections and AI support." }],
});

const features = [
    {
        icon: Camera,
        title: "Photo Diagnosis",
        desc: "Snap a photo of a crop or animal for AI-assisted guidance on possible issues, not a confirmed diagnosis.",
    },
    {
        icon: Mic,
        title: "Voice Notes",
        desc: "Capture farm observations with voice notes to support your daily records and questions.",
    },
    {
        icon: CircleHelp,
        title: "Smart Questions",
        desc: "FarmBuddy asks a few quick questions first, so the advice fits your farm.",
    },
    {
        icon: ClipboardList,
        title: "Farm Records",
        desc: "Track crop and livestock activities alongside bookkeeping, income, expenses, and inventory.",
    },
    {
        icon: Bell,
        title: "Reminders",
        desc: "Plan vaccines, spraying, feeding, deworming, and harvest tasks with reminders.",
    },
    {
        icon: Users,
        title: "Farmer Network",
        desc: "Connect with farmers and explore marketplace listings from dealers and buyers.",
    },
    {
        icon: TriangleAlert,
        title: "Outbreak Alerts",
        desc: "Follow reported crop and animal health alerts in your area to inform your next steps.",
    },
    {
        icon: BadgeCheck,
        title: "Farm Passport",
        desc: "Coming soon: a farm passport to bring your farm profile and activity history together.",
    },
];

const heroHeadings = [
    "Smart Farming Management System",
    "Manage crops, livestock, and farm records",
    "Your farm operations, supported by AI",
];

const marqueeItems = [
    "🌱 Crop and livestock management in one place",
    "🐔 Records, bookkeeping, and inventory",
    "🎙️ Speak your farm records, no typing",
    "🧑‍🌾 Coordinate your team and daily tasks",
    "🛒 Marketplace connections with AI support",
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
  <div>
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
                        🌱 Smart farming management for crops and livestock
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
                        FarmBuddy is your smart farming management system for
                        crops and livestock. Bring farm records, bookkeeping,
                        inventory, team coordination, and marketplace connections
                        together, with AI support for everyday farming questions.
                    </p>
                    <div
                        class="mt-10 grid w-full grid-cols-1 gap-4 sm:flex sm:justify-center sm:gap-4"
                    >
                        <a
                            href="/register"
                            class="flex justify-center rounded-full bg-[#066136] px-9 py-4 text-base font-semibold text-white transition hover:opacity-90"
                        >
                            Get Started
                        </a>
                        <a
                            href="#about"
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
                    Manage the whole farm, in one place
                </h2>
                <p
                    class="mt-4 text-base leading-relaxed text-slate-600 sm:mt-5 sm:text-lg"
                >
                    From crop planning and livestock care to bookkeeping,
                    inventory, and team tasks, keep your farm operations connected.
                    Explore the marketplace and community, with AI guidance when you need support.
                </p>
            </div>

            <AppPreviews />

            <FarmToolkit :features="features" />
        </section>
        <GrowTogether />
        <HowItWorks />
        <ContactSection />
    </main>
    <SiteFooter />
  </div>
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
