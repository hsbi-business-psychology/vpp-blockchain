const STORAGE_KEY = 'vpp-survey-secrets'

type SecretMap = Record<string, string>

function load(): SecretMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SecretMap) : {}
  } catch {
    return {}
  }
}

function save(map: SecretMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function storeSecret(surveyId: number, secret: string): void {
  const map = load()
  map[String(surveyId)] = secret
  save(map)
}

export function getSecret(surveyId: number): string | null {
  const map = load()
  return map[String(surveyId)] ?? null
}

export function hasSecret(surveyId: number): boolean {
  return getSecret(surveyId) !== null
}
