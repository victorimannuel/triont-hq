// Browser-side half of the passkey ceremonies. The server speaks the WebAuthn
// JSON dialect, where every binary field arrives as base64url; the browser
// wants ArrayBuffers going in and hands ArrayBuffers back coming out, so this
// file is mostly translation.

const toBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

const toB64 = (value: ArrayBuffer): string => {
  const bytes = new Uint8Array(value)
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type CreationOptions = { publicKey: Record<string, unknown> }
export type RequestOptions = { publicKey: Record<string, unknown> }

type Descriptor = { id: string; type: PublicKeyCredentialType; transports?: AuthenticatorTransport[] }

const descriptors = (list: unknown): PublicKeyCredentialDescriptor[] =>
  ((list ?? []) as Descriptor[]).map((item) => ({
    ...item,
    id: toBytes(item.id) as unknown as ArrayBuffer,
  }))

/** Whether this browser can even offer a platform authenticator. */
export async function passkeysSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function createCredential(options: CreationOptions) {
  const pk = { ...options.publicKey } as Record<string, unknown>
  pk.challenge = toBytes(pk.challenge as string)
  pk.user = { ...(pk.user as Record<string, unknown>) }
  ;(pk.user as Record<string, unknown>).id = toBytes(
    (pk.user as Record<string, string>).id,
  )
  pk.excludeCredentials = descriptors(pk.excludeCredentials)

  const credential = (await navigator.credentials.create({
    publicKey: pk as unknown as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('dibatalkan')

  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: toB64(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64(response.clientDataJSON),
      attestationObject: toB64(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  }
}

export async function getCredential(options: RequestOptions) {
  const pk = { ...options.publicKey } as Record<string, unknown>
  pk.challenge = toBytes(pk.challenge as string)
  pk.allowCredentials = descriptors(pk.allowCredentials)

  const credential = (await navigator.credentials.get({
    publicKey: pk as unknown as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('dibatalkan')

  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: toB64(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64(response.clientDataJSON),
      authenticatorData: toB64(response.authenticatorData),
      signature: toB64(response.signature),
      userHandle: response.userHandle ? toB64(response.userHandle) : undefined,
    },
  }
}

// ---------------------------------------------------------------- device

type HighEntropy = { platform?: string; platformVersion?: string; model?: string }
type UAData = {
  brands?: { brand: string; version: string }[]
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropy>
}

// Windows reports its version through the client hints as a UAP number rather
// than "11": anything from 13 up is Windows 11.
function windowsName(version?: string): string {
  const major = Number((version ?? '').split('.')[0])
  if (!Number.isFinite(major)) return 'Windows'
  if (major >= 13) return 'Windows 11'
  if (major >= 1) return 'Windows 10'
  return 'Windows'
}

function fromUserAgent(ua: string): string {
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : ''

  const android = ua.match(/Android[^;)]*;\s*([^;)]+)/)
  const platform =
    android ? android[1].replace(/\s+Build.*/, '').trim()
    : /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Windows NT 10/.test(ua) ? 'Windows'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux'
    : ''

  return [platform, browser].filter(Boolean).join(' · ')
}

/**
 * A readable name for the machine sitting in front of the user — "Windows 11 ·
 * Chrome", "SM-S911B · Chrome". Client hints know the phone model; everything
 * else falls back to reading the user agent.
 */
export async function deviceLabel(): Promise<string> {
  const data = (navigator as unknown as { userAgentData?: UAData }).userAgentData
  if (data?.getHighEntropyValues) {
    try {
      const info = await data.getHighEntropyValues(['platform', 'platformVersion', 'model'])
      const brand = data.brands?.find((b) => !/not.?a.?brand/i.test(b.brand))?.brand
      const platform = info.model
        ? info.model
        : info.platform === 'Windows'
          ? windowsName(info.platformVersion)
          : [info.platform, info.platformVersion?.split('.')[0]].filter(Boolean).join(' ')
      const label = [platform, brand].filter(Boolean).join(' · ')
      if (label) return label
    } catch {
      // Hints can be refused; the user agent still says something useful.
    }
  }
  return fromUserAgent(navigator.userAgent)
}

/** A cancelled or timed-out prompt is a normal outcome, not a server problem. */
export function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'dibatalin atau kelamaan nunggu'
    if (err.name === 'InvalidStateError') return 'perangkat ini udah kedaftar'
  }
  return err instanceof Error && err.message ? err.message : fallback
}
