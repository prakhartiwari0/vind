import { Array, Record, String, type Static, Number } from 'runtypes'
import { toBindingDoc, type BindingChannel, fromManyBindingDoc } from './messages/bindings'
import { toPageOverridesDoc, type PageOverridesChannel, fromManyPageOverridesDoc } from './messages/overrides'
import type { BindingDoc, PageOverrideDoc } from '~background/storage/db'
import { Err } from 'ts-results'
import { wrapResult, wrapResultAsync } from './control-flow'
import { InvalidImportedJSONError } from './error'

const BindingPayload = Record({
  id: String,
  domain: String,
  path: String,
  key: String,
  selector: String
})
type BindingPayload = Static<typeof BindingPayload>

const PageOverridePayload = Record({
  id: Number,
  overrides_domain_path: String,
  bindings_path: String
})
type PageOverridePayload = Static<typeof PageOverridePayload>

const ResourcePayload = Record({
  bindings: Array(BindingPayload),
  pageOverrides: Array(PageOverridePayload)
})
type ResourcePayload = Static<typeof ResourcePayload>

export class ResourceMigrator {
  constructor(
    private bindingChannel: BindingChannel,
    private pageOverridesChannel: PageOverridesChannel
  ) {}

  async exportAllResources () {
    return wrapResultAsync(async () => {
      const [
        bindings,
        pageOverrides,
      ] = await Promise.all([
        this.bindingChannel.getAllBindings().then(bindings => bindings.map(toBindingDoc)),
        this.pageOverridesChannel.getAllPageOverrides().then(pageOverrides => pageOverrides.map(toPageOverridesDoc))
      ])

      return this.exportResources(bindings, pageOverrides)
    })
  }

  exportResources (bindings: BindingDoc[], pageOverrides: PageOverrideDoc[]) {
    return JSON.stringify(ResourcePayload.check({
      bindings,
      pageOverrides
    }), null, 2)
  }

  parsePayload (json: string): ResourcePayload {
    return ResourcePayload.check(JSON.parse(json))
  }

  async importResources (json: string) {
    const { err, val } = wrapResult(() => this.parsePayload(json))

    if (err) return Err(new InvalidImportedJSONError())

    const { bindings, pageOverrides } = val

    return wrapResultAsync(() => Promise.all([
      ...fromManyBindingDoc(bindings).map(this.bindingChannel.upsertBinding),
      ...fromManyPageOverridesDoc(pageOverrides).map(this.pageOverridesChannel.upsertPageOverride),
    ]))
  }
}