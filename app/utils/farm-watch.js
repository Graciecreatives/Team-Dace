// Conservative planning prompts derived from a forecast, never disease detections.
export function weatherAdvice(forecast, user = {}) {
  const days = (Array.isArray(forecast?.days) ? forecast.days : []).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day?.date) && [day.max, day.min, day.rain].every(Number.isFinite) && day.rain >= 0)
  const enterprises = (Array.isArray(user.mainEnterprises) ? user.mainEnterprises : [user.mainEnterprises]).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(', ').slice(0, 160)
  const cropLabel = enterprises || 'your crops'
  const crops = !['livestock', 'poultry'].includes(user.farmType)
  const animals = user.farmType !== 'crops'
  const area = `${forecast?.latitude ?? ''},${forecast?.longitude ?? ''}`
  const advice = []
  for (const day of days) {
    const add = (type, title, body, level = 'watch') => advice.push({ id: `weather:${area}:${day.date}:${type}`, title, body, date: day.date, level, kind: 'weather' })
    if (day.max >= 35) add('heat', 'Hot conditions forecast', [crops ? `For ${cropLabel}, inspect soil moisture before watering. Consider cooler hours for field work and protect vulnerable seedlings where practical.` : '', animals ? 'Check drinking-water access, shade and ventilation for your animals.' : '', 'Use local crop and animal guidance to adapt these general planning prompts.'].filter(Boolean).join(' '))
    if (day.rain >= 20) add('rain', 'Heavy daily rainfall forecast', [crops ? `For ${cropLabel}, inspect drainage and plan field access. Check the forecast again before scheduling spraying or fertiliser work, and follow product labels.` : '', animals ? 'Inspect shelter drainage and keep feed storage protected from water.' : '', 'Rainfall alone does not confirm a disease outbreak.'].filter(Boolean).join(' '))
    if (day.min <= 2) add('cold', 'Cold conditions forecast', [crops ? `Check locally recommended protection for cold-sensitive plants in ${cropLabel}.` : '', animals ? 'Review dry shelter and protection for vulnerable animals with your local adviser.' : '', 'This is an area forecast, not a measurement on your farm.'].filter(Boolean).join(' '))
  }
  if (days.length && !advice.length) advice.push({ id: `weather:${area}:${days[0].date}:routine`, title: 'Plan from the forecast, check on the farm', body: `${crops ? `Check soil moisture and the growth stage of ${cropLabel} before choosing irrigation or field tasks. ` : ''}${animals ? 'Review animal water access, shelter and feed storage. ' : ''}No configured heat, daily rain or cold threshold was reached. This does not mean all weather hazards are absent.`, date: days[0].date, level: 'notice', kind: 'weather' })
  return advice
}
