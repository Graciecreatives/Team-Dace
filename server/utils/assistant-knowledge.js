// Curated paraphrases from primary guidance. No network access or outbreak feed.
const documents = [
  {
    id: 'fao-ipm', title: 'FAO: Integrated pest management',
    url: 'https://www.fao.org/pest-and-pesticide-management/ipm/integrated-pest-management/en',
    facts: ['Combine biological, physical and cultural controls in pest management.', 'Minimize pesticide risks rather than relying on pesticides alone.'],
    match: /crop|plant|pest|insect|maize|rotation|scout|pesticid|agrochemical|hygiene|soil/
  },
  {
    id: 'fao-ipm-practice', title: 'FAO: How integrated pest management works',
    url: 'https://www.fao.org/agriculture/crops/thematic-sitemap/theme/spi/scpi-home/managing-ecosystems/integrated-pest-management/ipm-how/en/',
    facts: ['Scout crops regularly and use crop rotation and hygiene practices.', 'Keep accurate agrochemical records and adapt guidance to local conditions.'],
    match: /crop|plant|pest|insect|maize|rotation|scout|pesticid|agrochemical|hygiene|soil/
  },
  {
    id: 'wsda-biosecurity', title: 'Washington State Department of Agriculture: Biosecurity',
    url: 'https://agr.wa.gov/departments/animals-livestock-and-pets/animal-husbandry/biosecurity',
    facts: ['Separate sick and newly introduced animals and use separate equipment.', 'Remove organic debris before disinfection and wash hands.'],
    match: /animal|livestock|cattle|cow|goat|sheep|poultry|chicken|pig|biosecurity|disinfect|sick|herd|flock/
  }
]
export function retrieveAssistantKnowledge(question, task = 'chat', farmType = '') {
  const query = `${String(question).slice(0, 4000)} ${task} ${String(farmType).slice(0, 300)}`.toLowerCase()
  return documents.filter(doc => doc.match.test(query)).slice(0, 3).map(({ id, title, url, facts }) => ({ id, title, url, facts: [...facts] }))
}
