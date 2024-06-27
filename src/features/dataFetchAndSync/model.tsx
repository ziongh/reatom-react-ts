/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  reatomResource,
  onDisconnect,
  withDataAtom,
  withErrorAtom,
  withAbort,
  withStatusesAtom,
  withReset,
  withRetry,
  reatomAsync,
  onConnect,
} from '@reatom/framework'
import { onEvent } from '@reatom/web'
import { request } from './request'

const socket = new WebSocket('wss://echo.websocket.org/.ws')

type TypeLatLngBackend = {
  latLngs: any[]
  macros: any[]
  maxLatLngId: number
  maxMacroId: number
}

type TypeWatchBasicInfo = {
  AllClientPlanningAreas: any[]
  AllCompositions: any[]
}

type TypeComposition = { Id: number; Truck_Id: number }
interface Dictionary<T> {
  [Key: number]: T
}

type TypeWatchList = {
  AllServices: any[]
  Compositions: Dictionary<TypeComposition>
}

export const basicInfoResource = reatomResource(async (ctx) => {
  return await ctx.schedule(() =>
    request<TypeWatchBasicInfo>(`/Watch/Api/Index`, ctx.controller),
  )
}, 'basicInfoResource').pipe(
  withDataAtom(null),
  withErrorAtom(),
  withStatusesAtom(),
  withReset(),
)

onDisconnect(basicInfoResource.dataAtom, (ctx) => {
  basicInfoResource.dataAtom.reset(ctx)
  basicInfoResource.reset(ctx)
})

export const fetchBackendDataWatch = reatomAsync(
  async (ctx, formData: number) => {
    const basicInfo = ctx.get(basicInfoResource.dataAtom)
    if (!basicInfo) {
      return
    }

    const { signal } = ctx.controller
    const data = JSON.stringify(formData)
    const response = request<TypeWatchList>(`/Watch/Api/List`, {
      method: 'POST',
      body: data,
      signal,
    })
    return response
  },
  'fetchBackendDataWatch',
).pipe(
  withDataAtom(null),
  withErrorAtom(),
  withAbort(),
  withStatusesAtom(),
  withReset(),
)

onDisconnect(fetchBackendDataWatch.dataAtom, (ctx) => {
  fetchBackendDataWatch.dataAtom.reset(ctx)
  fetchBackendDataWatch.reset(ctx)
})

const fetchLatAndMacros = reatomResource(async (ctx) => {
  const backendItems = ctx.spy(fetchBackendDataWatch.dataAtom)
  if (!backendItems) {
    return null
  }

  const { signal } = ctx.controller

  const lastData: TypeLatLngBackend | null = ctx.spy(fetchLatAndMacros.dataAtom)

  const maxLatLngId = lastData?.maxLatLngId ?? 0
  const maxMacroId = lastData?.maxMacroId ?? 0

  const data = JSON.stringify({
    MaxLatLngId: maxLatLngId,
    MaxMacroId: maxMacroId,
    SelectedTrucks: Object.keys(backendItems.Compositions).map(
      (c) => backendItems.Compositions[c].Truck_Id,
    ),
  })
  return await ctx.schedule(() =>
    request<TypeLatLngBackend>(`/Watch/Api/ListLatLngsAndMacros`, {
      method: 'POST',
      body: data,
      signal,
    }),
  )
}, 'fetchLatAndMacros').pipe(
  withDataAtom(null, (ctx, newState, state) => {
    const mergedState = {
      latLngs: [...(state?.latLngs ?? []), ...(newState?.latLngs ?? [])],
      macros: [...(state?.macros ?? []), ...(newState?.macros ?? [])],
      maxLatLngId: newState?.maxLatLngId ?? 0,
      maxMacroId: newState?.maxMacroId ?? 0,
    }
    return mergedState
  }),
  withErrorAtom(),
  withStatusesAtom(),
  withReset(),
  withRetry(),
)

onDisconnect(fetchLatAndMacros.dataAtom, (ctx) => {
  fetchLatAndMacros.dataAtom.reset(ctx)
  fetchLatAndMacros.reset(ctx)
})

onConnect(fetchLatAndMacros.dataAtom, async (ctx) => {
  onEvent(ctx, socket, 'LatLngUpdated', () => {
    fetchLatAndMacros.retry(ctx).catch(() => {})
  })
})
