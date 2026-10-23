<script setup>
// Decorative floating farm visuals for the hero.
// Pure inline SVG: no network requests, no layout shift, no new dependencies.
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
    <!-- 1. Green leaf — top-left -->
    <span
      class="farm-item float-gentle left-[3%] top-[6%] w-10 md:w-16"
      style="rotate: -14deg; animation-delay: 0.3s; animation-duration: 5.2s"
    >
      <svg viewBox="0 0 64 64">
        <path d="M58 6C34 4 12 16 8 38c-3 15 5 20 15 17C38 46 52 28 58 6Z" fill="#4E9A51" />
        <path d="M58 6C44 14 24 32 13 55c-1 2 0 3 1 3C30 44 50 24 58 6Z" fill="#6FBF73" />
        <path
          d="M58 6C42 18 24 34 14 54"
          fill="none"
          stroke="#2E7D32"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <path
          d="M45 13l-5 11M51 21l-6 10M34 23l-5 10M25 34l-5 9"
          fill="none"
          stroke="#2E7D32"
          stroke-width="1.8"
          stroke-linecap="round"
          opacity="0.6"
        />
      </svg>
    </span>

    <!-- 2. Tomato leaf accent -->
    <span
      class="farm-item float-drift left-[13%] top-[17%] hidden w-9 opacity-70 md:block md:w-14 md:opacity-90"
      style="rotate: 20deg; animation-delay: 1.1s; animation-duration: 4.6s"
    >
      <svg viewBox="0 0 64 64">
        <path d="M32 60V32" fill="none" stroke="#2E7D32" stroke-width="3" stroke-linecap="round" />
        <path d="M32 4c9 7 11 20 0 30-11-10-9-23 0-30Z" fill="#3F8E43" />
        <path d="M12 24c11-3 20 5 20 16-12 3-21-5-20-16Z" fill="#4CA150" />
        <path d="M52 24c-11-3-20 5-20 16 12 3 21-5 20-16Z" fill="#4CA150" />
        <path
          d="M32 9v17M17 29l11 7M47 29l-11 7"
          fill="none"
          stroke="#2E7D32"
          stroke-width="1.8"
          stroke-linecap="round"
          opacity="0.7"
        />
      </svg>
    </span>

    <!-- 3. Ripe tomato — left-middle focal accent -->
    <span
      class="farm-item farm-focal float-slow left-[5%] top-[40%] w-12 opacity-70 md:w-24 md:opacity-100"
      style="rotate: -6deg; animation-delay: 0.9s; animation-duration: 7.4s"
    >
      <svg viewBox="0 0 64 64">
        <defs>
          <radialGradient id="fb-tom" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0" stop-color="#FF7058" />
            <stop offset="0.55" stop-color="#E53935" />
            <stop offset="1" stop-color="#B71C1C" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="38" r="22" fill="url(#fb-tom)" />
        <ellipse cx="24" cy="28" rx="7" ry="5" fill="#fff" opacity="0.45" transform="rotate(-24 24 28)" />
        <g fill="#3F8E43">
          <ellipse cx="32" cy="18" rx="4.5" ry="7" />
          <ellipse cx="23" cy="20" rx="4" ry="6" transform="rotate(-55 23 20)" />
          <ellipse cx="41" cy="20" rx="4" ry="6" transform="rotate(55 41 20)" />
          <ellipse cx="17" cy="25" rx="3.5" ry="5" transform="rotate(-80 17 25)" />
          <ellipse cx="47" cy="25" rx="3.5" ry="5" transform="rotate(80 47 25)" />
        </g>
        <path d="M32 14V6" fill="none" stroke="#2E7D32" stroke-width="3" stroke-linecap="round" />
      </svg>
    </span>

    <!-- 4. Cassava root — lower-left -->
    <span
      class="farm-item float-rotate left-[10%] bottom-[12%] hidden w-10 opacity-75 md:block md:w-16 md:opacity-95"
      style="rotate: 12deg; animation-delay: 2.1s; animation-duration: 6.6s"
    >
      <svg viewBox="0 0 64 80">
        <path
          d="M30 16c-5 16-11 34-8 52"
          fill="none"
          stroke="#A1887F"
          stroke-width="14"
          stroke-linecap="round"
        />
        <path
          d="M38 16c6 12 11 26 9 40"
          fill="none"
          stroke="#8D6E63"
          stroke-width="12"
          stroke-linecap="round"
        />
        <path
          d="M26 18c-6 10-9 22-7 32"
          fill="none"
          stroke="#BCAAA4"
          stroke-width="10"
          stroke-linecap="round"
        />
        <circle cx="22" cy="67" r="4.5" fill="#EFE3D8" />
        <circle cx="47" cy="55" r="4" fill="#EFE3D8" />
        <circle cx="19" cy="49" r="3.5" fill="#EFE3D8" />
        <rect x="25" y="5" width="14" height="13" rx="5" fill="#795548" />
        <ellipse cx="32" cy="7" rx="7" ry="3" fill="#EFE3D8" />
        <path
          d="M28 30l-3 8M40 32l3 7"
          fill="none"
          stroke="#5D4037"
          stroke-width="1.8"
          stroke-linecap="round"
          opacity="0.5"
        />
      </svg>
    </span>

    <!-- 5. Maize cob — bottom-left focal accent -->
    <span
      class="farm-item farm-focal float-rotate left-[3%] bottom-[3%] w-11 md:w-20"
      style="rotate: -18deg; animation-delay: 0.6s; animation-duration: 6.2s"
    >
      <svg viewBox="0 0 64 96">
        <defs>
          <clipPath id="fb-cob">
            <ellipse cx="32" cy="54" rx="15" ry="33" />
          </clipPath>
        </defs>
        <path d="M30 64C14 56 6 32 8 6c12 8 20 28 24 50Z" fill="#43A047" />
        <path d="M34 64c16-8 24-32 22-58-12 8-20 28-24 50Z" fill="#5BB861" />
        <ellipse cx="32" cy="54" rx="15" ry="33" fill="#F9C23C" />
        <g clip-path="url(#fb-cob)" fill="#E8A81C">
          <circle cx="20" cy="28" r="3.8" /><circle cx="29" cy="28" r="3.8" />
          <circle cx="38" cy="28" r="3.8" /><circle cx="47" cy="28" r="3.8" />
          <circle cx="20" cy="38" r="3.8" /><circle cx="29" cy="38" r="3.8" />
          <circle cx="38" cy="38" r="3.8" /><circle cx="47" cy="38" r="3.8" />
          <circle cx="20" cy="48" r="3.8" /><circle cx="29" cy="48" r="3.8" />
          <circle cx="38" cy="48" r="3.8" /><circle cx="47" cy="48" r="3.8" />
          <circle cx="20" cy="58" r="3.8" /><circle cx="29" cy="58" r="3.8" />
          <circle cx="38" cy="58" r="3.8" /><circle cx="47" cy="58" r="3.8" />
          <circle cx="20" cy="68" r="3.8" /><circle cx="29" cy="68" r="3.8" />
          <circle cx="38" cy="68" r="3.8" /><circle cx="47" cy="68" r="3.8" />
          <circle cx="20" cy="78" r="3.8" /><circle cx="29" cy="78" r="3.8" />
          <circle cx="38" cy="78" r="3.8" /><circle cx="47" cy="78" r="3.8" />
        </g>
        <ellipse cx="26" cy="40" rx="5" ry="15" fill="#fff" opacity="0.25" />
        <path d="M32 96c-12-2-18-12-19-26 8 9 14 14 19 15Z" fill="#388E3C" />
        <path
          d="M32 22c1-6 3-10 6-13"
          fill="none"
          stroke="#C77B52"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
    </span>

    <!-- 6. Small seedling in soil — upper-center-left -->
    <span
      class="farm-item float-drift left-[19%] top-[8%] w-9 opacity-70 md:w-14 md:opacity-100"
      style="animation-delay: 1.7s; animation-duration: 5.8s"
    >
      <svg viewBox="0 0 64 64">
        <ellipse cx="32" cy="52" rx="25" ry="9" fill="#795548" />
        <ellipse cx="32" cy="50" rx="25" ry="8" fill="#8D6E63" />
        <circle cx="22" cy="50" r="2" fill="#5D4037" />
        <circle cx="42" cy="53" r="1.7" fill="#5D4037" />
        <circle cx="33" cy="47" r="1.5" fill="#6D4C41" />
        <path d="M32 48V26" fill="none" stroke="#2E7D32" stroke-width="3" stroke-linecap="round" />
        <path d="M32 34c-11-1-18-9-18-19 11 1 18 9 18 19Z" fill="#4E9A51" />
        <path d="M32 30c11-1 18-9 18-19-11 1-18 9-18 19Z" fill="#66BB6A" />
        <path
          d="M30 32l-8-7M34 28l8-7"
          fill="none"
          stroke="#2E7D32"
          stroke-width="1.6"
          stroke-linecap="round"
          opacity="0.6"
        />
      </svg>
    </span>

    <!-- 7. Chicken / hen — top-right focal accent -->
    <span
      class="farm-item farm-focal float-slow right-[4%] top-[5%] w-14 opacity-75 md:w-28 md:opacity-100"
      style="animation-delay: 0.4s; animation-duration: 7.8s"
    >
      <svg viewBox="0 0 96 72">
        <path
          d="M66 30c9-11 19-14 26-11-7 5-9 12-8 19 6-5 13-6 18-4-9 3-15 9-19 18Z"
          fill="#8D5A2B"
        />
        <ellipse cx="50" cy="44" rx="27" ry="19" fill="#D08B52" />
        <ellipse cx="48" cy="53" rx="19" ry="9" fill="#E9B483" opacity="0.7" />
        <path d="M42 38c12-5 24-1 29 8-8 7-22 8-30 2Z" fill="#B87333" />
        <path
          d="M50 44l8 3M48 50l10 2"
          fill="none"
          stroke="#8D5A2B"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <circle cx="26" cy="24" r="13" fill="#D98B52" />
        <path d="M16 16c0-5 4-7 7-4 1-4 6-5 9-1 3-3 7-1 7 4-8 0-16 1-23 1Z" fill="#E53935" />
        <circle cx="23" cy="21" r="2.4" fill="#2B2B2B" />
        <circle cx="22.3" cy="20.3" r="0.9" fill="#fff" />
        <path d="M14 23l-9 3 9 4Z" fill="#F9A825" />
        <path d="M17 33c-2 3-1 7 3 7s6-3 5-7Z" fill="#E53935" />
        <g fill="none" stroke="#F9A825" stroke-width="2.6" stroke-linecap="round">
          <path d="M42 62v7M42 69h-6M42 69h6M42 69l-4 4M42 69l4 4" />
          <path d="M56 62v7M56 69h-6M56 69h6M56 69l-4 4M56 69l4 4" />
        </g>
      </svg>
    </span>

    <!-- 8. Cute chick — right upper -->
    <span
      class="farm-item float-gentle right-[14%] top-[26%] w-8 opacity-70 md:w-14 md:opacity-100"
      style="rotate: 8deg; animation-delay: 2.4s; animation-duration: 4.8s"
    >
      <svg viewBox="0 0 64 64">
        <circle cx="33" cy="35" r="19" fill="#FDD835" />
        <path d="M34 32c9-3 17 2 19 10-7 6-17 4-20-3Z" fill="#F2B705" />
        <path
          d="M40 38c4 1 7 3 9 6"
          fill="none"
          stroke="#E0A800"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <path
          d="M30 16c0-4 2-6 4-7M35 15c1-4 3-6 6-6"
          fill="none"
          stroke="#F9C800"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <circle cx="22" cy="31" r="2.6" fill="#2B2B2B" />
        <circle cx="21.2" cy="30.2" r="1" fill="#fff" />
        <path d="M14 34l-9 3 9 4Z" fill="#FB8C00" />
        <ellipse cx="26" cy="41" rx="4" ry="3" fill="#FF8A65" opacity="0.55" />
        <g fill="none" stroke="#FB8C00" stroke-width="2.6" stroke-linecap="round">
          <path d="M28 53v7M28 60h-5M28 60h5" />
          <path d="M39 53v7M39 60h-5M39 60h5" />
        </g>
      </svg>
    </span>

    <!-- 9. Red pepper — right-middle -->
    <span
      class="farm-item float-rotate right-[6%] top-[44%] hidden w-10 md:block md:w-16"
      style="rotate: 16deg; animation-delay: 1.3s; animation-duration: 6.8s"
    >
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id="fb-pep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#FF5A45" />
            <stop offset="1" stop-color="#C62828" />
          </linearGradient>
        </defs>
        <path
          d="M32 24c13-6 27 3 27 17 0 13-11 25-27 25S5 54 5 41c0-14 14-23 27-17Z"
          fill="url(#fb-pep)"
        />
        <path
          d="M22 42c0 9 4 18 10 24M42 42c0 9-4 18-10 24"
          fill="none"
          stroke="#B71C1C"
          stroke-width="2"
          opacity="0.45"
        />
        <ellipse
          cx="20"
          cy="34"
          rx="6"
          ry="9"
          fill="#fff"
          opacity="0.4"
          transform="rotate(-18 20 34)"
        />
        <ellipse cx="32" cy="23" rx="9" ry="5" fill="#43A047" />
        <path
          d="M32 20c0-7 3-10 8-11"
          fill="none"
          stroke="#2E7D32"
          stroke-width="3.5"
          stroke-linecap="round"
        />
      </svg>
    </span>

    <!-- 10. Brown egg — lower-center -->
    <span
      class="farm-item float-gentle left-[47%] bottom-[2%] w-7 md:w-10"
      style="rotate: -10deg; animation-delay: 2.8s; animation-duration: 5.6s"
    >
      <svg viewBox="0 0 48 64">
        <defs>
          <linearGradient id="fb-egg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#FBF3E4" />
            <stop offset="1" stop-color="#E8D3AE" />
          </linearGradient>
        </defs>
        <path d="M24 4C14 4 6 23 6 38c0 13 8 22 18 22s18-9 18-22C42 23 34 4 24 4Z" fill="url(#fb-egg)" />
        <ellipse cx="30" cy="46" rx="11" ry="12" fill="#D9BF95" opacity="0.5" />
        <ellipse
          cx="18"
          cy="26"
          rx="6"
          ry="10"
          fill="#fff"
          opacity="0.55"
          transform="rotate(-12 18 26)"
        />
      </svg>
    </span>

    <!-- 11. Produce basket — bottom-right focal accent -->
    <span
      class="farm-item farm-focal float-slow right-[4%] bottom-[7%] hidden w-12 md:block md:w-24"
      style="animation-delay: 1.9s; animation-duration: 7.2s"
    >
      <svg viewBox="0 0 80 64">
        <path
          d="M22 32C22 16 31 8 40 8s18 8 18 24"
          fill="none"
          stroke="#A9603E"
          stroke-width="5"
          stroke-linecap="round"
        />
        <circle cx="31" cy="26" r="8" fill="#E53935" />
        <g fill="#3F8E43">
          <ellipse cx="31" cy="19" rx="2.5" ry="4" />
          <ellipse cx="27" cy="21" rx="2" ry="3" transform="rotate(-55 27 21)" />
          <ellipse cx="35" cy="21" rx="2" ry="3" transform="rotate(55 35 21)" />
        </g>
        <circle cx="45" cy="24" r="7" fill="#F9C23C" />
        <path d="M43 18l4 5M47 18l-4 5" stroke="#E8A81C" stroke-width="1.5" fill="none" />
        <path d="M54 22c6-2 10-6 11-12-7 0-11 5-11 12Z" fill="#4E9A51" />
        <path d="M12 32h56l-5 24c-1 3-3 5-6 5H23c-3 0-5-2-6-5Z" fill="#C77B52" />
        <path
          d="M14 41h52M16 50h48"
          fill="none"
          stroke="#A9603E"
          stroke-width="2.5"
        />
        <path
          d="M26 33l-2 27M40 33v27M54 33l2 27"
          fill="none"
          stroke="#A9603E"
          stroke-width="2"
          opacity="0.7"
        />
        <rect x="9" y="28" width="62" height="9" rx="4.5" fill="#8D5A2B" />
      </svg>
    </span>

    <!-- 12. Watering can — right lower -->
    <span
      class="farm-item float-drift right-[17%] bottom-[13%] hidden w-9 opacity-70 md:block md:w-16 md:opacity-90"
      style="rotate: -8deg; animation-delay: 0.8s; animation-duration: 5.4s"
    >
      <svg viewBox="0 0 80 64">
        <path d="M24 30L6 22l3-9 17 8Z" fill="#4CAF50" />
        <path d="M9 13l10 5-4 9-9-6Z" fill="#388E3C" />
        <circle cx="8" cy="17" r="1.2" fill="#2E7D32" />
        <circle cx="12" cy="21" r="1.2" fill="#2E7D32" />
        <rect x="22" y="20" width="36" height="34" rx="9" fill="#66BB6A" />
        <ellipse cx="40" cy="21" rx="18" ry="5" fill="#57A85B" />
        <rect x="28" y="26" width="7" height="23" rx="3.5" fill="#fff" opacity="0.3" />
        <path
          d="M34 20c-2-9 6-14 14-11"
          fill="none"
          stroke="#388E3C"
          stroke-width="5"
          stroke-linecap="round"
        />
        <circle cx="5" cy="31" r="2.5" fill="#4FC3F7" />
        <circle cx="11" cy="37" r="2" fill="#4FC3F7" />
        <circle cx="2" cy="39" r="1.8" fill="#4FC3F7" />
      </svg>
    </span>

    <!-- 13. Feed bowl with grain — lower-left -->
    <span
      class="farm-item float-gentle left-[21%] bottom-[5%] hidden w-9 opacity-70 md:block md:w-14 md:opacity-90"
      style="animation-delay: 3.1s; animation-duration: 6.4s"
    >
      <svg viewBox="0 0 72 56">
        <path d="M8 28h56c0 15-12 26-28 26S8 43 8 28Z" fill="#C77B52" />
        <path
          d="M11 37c9 5 41 5 50 0"
          fill="none"
          stroke="#A9603E"
          stroke-width="4"
        />
        <ellipse cx="36" cy="28" rx="29" ry="7" fill="#D98B5E" />
        <ellipse cx="36" cy="28" rx="22" ry="4.5" fill="#A9603E" />
        <g fill="#F9C23C">
          <circle cx="25" cy="23" r="4" />
          <circle cx="34" cy="20" r="4.5" />
          <circle cx="43" cy="22" r="4" />
          <circle cx="51" cy="25" r="3.5" />
          <circle cx="29" cy="26" r="3.5" />
          <circle cx="38" cy="25" r="4" />
        </g>
        <g fill="#E0A82E">
          <circle cx="33" cy="24" r="3" />
          <circle cx="46" cy="26" r="3" />
        </g>
        <circle cx="67" cy="50" r="2.5" fill="#E0A82E" />
        <circle cx="4" cy="51" r="2.2" fill="#E0A82E" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.farm-item {
  position: absolute;
}

.farm-item svg {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 8px 12px rgba(43, 43, 43, 0.16));
}

.farm-focal svg {
  filter: drop-shadow(0 14px 18px rgba(43, 43, 43, 0.22));
}

.float-gentle {
  animation: float-gentle 5s ease-in-out infinite;
}

.float-slow {
  animation: float-slow 7.5s ease-in-out infinite;
}

.float-rotate {
  animation: float-rotate 6.5s ease-in-out infinite;
}

.float-drift {
  animation: float-drift 4.5s ease-in-out infinite;
}

@keyframes float-gentle {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-16px);
  }
}

@keyframes float-slow {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-24px);
  }
}

@keyframes float-rotate {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-13px) rotate(5deg);
  }
}

@keyframes float-drift {
  0% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(11px, -14px);
  }
  100% {
    transform: translate(0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .farm-item {
    animation: none !important;
  }
}
</style>
