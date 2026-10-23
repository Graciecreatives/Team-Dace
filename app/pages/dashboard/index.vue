<script setup>
definePageMeta({
  middleware: async (to) => {
    const requestFetch = useRequestFetch()
    let user
    try { user = (await requestFetch('/api/auth/me'))?.user } catch { return navigateTo('/login', { replace: true }) }
    if (!user) return navigateTo('/login', { replace: true })
    if (user.onboardingCompleted !== true) return navigateTo('/onboarding', { replace: true })
    const canonical = user.farmType === 'crops' ? '/dashboard/crops' : ['livestock', 'poultry'].includes(user.farmType) ? '/dashboard/livestock' : '/dashboard'
    if (to.path.replace(/\/$/, '') !== canonical) return navigateTo(canonical, { replace: true })
  },
})
</script>

<template>
  <FarmDashboard />
</template>
