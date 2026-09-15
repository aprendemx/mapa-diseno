import { validateMedium } from '@mapa-mexico/project-store'
import type { MediumInput, SocialNetwork } from '@mapa-mexico/project-store'
import { listStates } from '@mapa-mexico/postgres'

const NETWORKS: readonly SocialNetwork[] = ['instagram', 'facebook', 'x', 'tiktok', 'youtube']

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Normalises whatever the client sent into the shape the domain expects, then
 * validates it.
 *
 * Coercing before validating is deliberate: the browser is not the only thing
 * that can post here, and a missing field should become an empty string with a
 * clear message, not a type error from deep inside a query.
 */
export async function readMediumInput(event: Parameters<typeof readBody>[0]): Promise<MediumInput> {
  const body = await readBody<Record<string, unknown>>(event)

  const stateIdRaw = text(body?.['stateId']).trim()
  const themes = Array.isArray(body?.['socialThemes']) ? body['socialThemes'] : []

  const input: MediumInput = {
    name: text(body?.['name']),
    stateId: stateIdRaw === '' ? null : stateIdRaw,
    active: body?.['active'] !== false,
    notes: text(body?.['notes']),
    coverageText: text(body?.['coverageText']),
    coverageStates: Array.isArray(body?.['coverageStates'])
      ? (body['coverageStates'] as unknown[]).map(text).filter(Boolean)
      : [],
    socialEnabled: body?.['socialEnabled'] === true,
    socialThemes: (themes as Record<string, unknown>[]).map((theme) => ({
      ...(typeof theme?.['id'] === 'string' ? { id: theme['id'] } : {}),
      title: text(theme?.['title']),
      links: Object.fromEntries(
        NETWORKS.map((network) => [
          network,
          text((theme?.['links'] as Record<string, unknown> | undefined)?.[network]),
        ]),
      ) as Record<SocialNetwork, string>,
    })),
  }

  const states = await listStates(database())
  const problems = validateMedium(input, new Set(states.map((state) => state.id)))

  if (problems.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Hay datos que corregir.',
      data: { problems },
    })
  }

  return input
}
