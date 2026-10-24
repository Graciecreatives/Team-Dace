// A browser-only enquiry basket. It does not reserve stock or create a paid order.
export function enquiryBasket(products, quantities) {
  const lines = [], invalid = [], totals = {}
  for (const [id, value] of Object.entries(quantities)) {
    const product = products.find(item => item.id === id)
    const quantity = typeof value === 'number' ? value : NaN
    if (!product || !Number.isFinite(quantity) || quantity <= 0 || quantity > product.quantity) { invalid.push(id); continue }
    const cents = Math.round(Math.round(product.price * 100) * quantity)
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger((totals[product.currency] || 0) + cents)) { invalid.push(id); continue }
    totals[product.currency] = (totals[product.currency] || 0) + cents
    lines.push({ ...product, requested: quantity, cents })
  }
  return { lines, invalid, totals }
}
export function enquiryText(farm, basket) {
  if (basket.invalid.length || !basket.lines.length) return ''
  return [`Product enquiry for ${farm.name}`, ...basket.lines.map(line => `${line.name}: ${line.requested} ${line.unit} at ${line.currency} ${line.price.toFixed(2)} / ${line.unit} = ${line.currency} ${(line.cents / 100).toFixed(2)}`), ...Object.entries(basket.totals).map(([currency, cents]) => `Estimated total: ${currency} ${(cents / 100).toFixed(2)}`), 'Please confirm availability, final pricing, delivery and payment. This is an enquiry only, not a confirmed or paid order.'].join('\n')
}
