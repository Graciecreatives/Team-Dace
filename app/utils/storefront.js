export const isUploadedPhoto = value => /^\/api\/product-images\/[a-f0-9-]{36}$/.test(value || '')

export function storefrontHeroImage(farm, heroProduct, canShowImage) {
  if (canShowImage({ imageUrl: farm?.coverImageUrl })) return { url: farm.coverImageUrl, alt: `${farm.name} cover photo` }
  return heroProduct ? { url: heroProduct.imageUrl, alt: heroProduct.name } : null
}

export function storefrontProducts(products, search = '', sort = 'name', availableOnly = false) {
  const query = search.trim().toLocaleLowerCase()
  return products.filter(product => (!availableOnly || product.quantity > 0) && `${product.name} ${product.description || ''}`.toLocaleLowerCase().includes(query)).slice().sort((a, b) => {
    if (sort === 'price-asc' || sort === 'price-desc') {
      const currency = a.currency.localeCompare(b.currency)
      if (currency) return currency
      const price = (a.price - b.price) * (sort === 'price-desc' ? -1 : 1)
      if (price) return price
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}
