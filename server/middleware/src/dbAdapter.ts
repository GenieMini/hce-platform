//
// Copyright © 2022 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { type MeasureContext } from '@hcengineering/core'
import { PlatformError, unknownStatus } from '@hcengineering/platform'
import type {
  DbAdapter,
  DbConfiguration,
  Middleware,
  MiddlewareCreator,
  PipelineContext
} from '@hcengineering/server-core'
import { BaseMiddleware, createServiceAdaptersManager, DbAdapterManagerImpl } from '@hcengineering/server-core'

/**
 * @public
 */
export class DBAdapterMiddleware extends BaseMiddleware implements Middleware {
  constructor (
    context: PipelineContext,
    next: Middleware | undefined,
    readonly conf: DbConfiguration
  ) {
    super(context, next)
  }

  static create (conf: DbConfiguration): MiddlewareCreator {
    return async (ctx, context, next): Promise<Middleware> => {
      const middleware = new DBAdapterMiddleware(context, next, conf)
      await middleware.init(ctx)
      return middleware
    }
  }

  async init (ctx: MeasureContext): Promise<void> {
    const adapters = new Map<string, DbAdapter>()

    await ctx.with('create-adapters', {}, async (ctx) => {
      if (this.context.storageAdapter == null) {
        throw new PlatformError(unknownStatus('StorageSdapter is not specified'))
      }
      for (const key in this.conf.adapters) {
        const adapterConf = this.conf.adapters[key]
        adapters.set(
          key,
          await adapterConf.factory(
            ctx,
            this.context.hierarchy,
            adapterConf.url,
            this.context.workspace,
            this.context.modelDb,
            this.context.storageAdapter
          )
        )
      }
    })

    await ctx.with('init-adapters', {}, async (ctx) => {
      for (const adapter of adapters.values()) {
        await adapter.init?.()
      }
    })
    const metrics = this.conf.metrics.newChild('📔 server-storage', {})

    const defaultAdapter = adapters.get(this.conf.defaultAdapter)
    if (defaultAdapter === undefined) {
      throw new Error(`No default Adapter for ${this.conf.defaultAdapter}`)
    }

    this.context.serviceAdapterManager = await createServiceAdaptersManager(
      this.conf.serviceAdapters,
      this.conf.metrics.newChild('🔌 service adapters', {})
    )

    // We need to init all next, since we will use model

    const adapterManager = new DbAdapterManagerImpl(metrics, this.conf.domains, this.context, defaultAdapter, adapters)
    this.context.adapterManager = adapterManager
  }

  async close (): Promise<void> {
    await this.context.adapterManager?.close()
    await this.context.serviceAdapterManager?.close()
  }
}