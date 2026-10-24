import nitro from '../.output/server/index.mjs'
import { boundedWorkerRequest } from './request-guard.js'

export default {
  ...nitro,
  async fetch(request, env, context) {
    const bounded = await boundedWorkerRequest(request)
    if (bounded instanceof Response) return bounded
    return nitro.fetch(bounded, env, context)
  },
}
