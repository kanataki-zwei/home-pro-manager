import { apiPost } from './api'

function bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let str = ''
    for (const b of bytes) str += String.fromCharCode(b)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(b64url: string): ArrayBuffer {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=')
    const str = atob(padded)
    const bytes = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
    return bytes.buffer
}

// JSON shapes coming from the backend (before ArrayBuffer conversion)
interface RawCredentialDescriptor { id: string; type: string; transports?: string[] }
interface RawUserEntity { id: string; name: string; displayName: string }
interface RawRegistrationOptions {
    challenge: string
    rp: PublicKeyCredentialRpEntity
    user: RawUserEntity
    pubKeyCredParams: PublicKeyCredentialParameters[]
    timeout?: number
    excludeCredentials?: RawCredentialDescriptor[]
    authenticatorSelection?: AuthenticatorSelectionCriteria
    attestation?: AttestationConveyancePreference
}
interface RawAuthenticationOptions {
    challenge: string
    rpId?: string
    timeout?: number
    allowCredentials?: RawCredentialDescriptor[]
    userVerification?: UserVerificationRequirement
}

export function isBiometricSupported(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

export function isBiometricRegistered(): boolean {
    return typeof window !== 'undefined' && localStorage.getItem('hpm_webauthn') === '1'
}

export function setBiometricRegistered(value: boolean) {
    if (value) localStorage.setItem('hpm_webauthn', '1')
    else localStorage.removeItem('hpm_webauthn')
}

export async function registerBiometric(): Promise<void> {
    const { options, challenge_token } = await apiPost<{ options: RawRegistrationOptions; challenge_token: string }>(
        '/api/auth/webauthn/register/begin',
        {}
    )

    const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rp: options.rp,
        user: {
            id: base64urlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        excludeCredentials: (options.excludeCredentials ?? []).map(c => ({
            id: base64urlToBuffer(c.id),
            type: 'public-key' as PublicKeyCredentialType,
            transports: c.transports as AuthenticatorTransport[],
        })),
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation,
    }

    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null
    if (!credential) throw new Error('Biometric registration cancelled')

    const attestation = credential.response as AuthenticatorAttestationResponse
    await apiPost('/api/auth/webauthn/register/complete', {
        challenge_token,
        credential: {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
                attestationObject: bufferToBase64url(attestation.attestationObject),
            },
        },
    })

    setBiometricRegistered(true)
}

export async function loginWithBiometric(email: string): Promise<{ id: string; email: string; name: string | null }> {
    const { options, challenge_token } = await apiPost<{ options: RawAuthenticationOptions; challenge_token: string }>(
        '/api/auth/webauthn/login/begin',
        { email }
    )

    const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        allowCredentials: (options.allowCredentials ?? []).map(c => ({
            id: base64urlToBuffer(c.id),
            type: 'public-key' as PublicKeyCredentialType,
            transports: c.transports as AuthenticatorTransport[],
        })),
        userVerification: options.userVerification,
    }

    const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
    if (!assertion) throw new Error('Biometric authentication cancelled')

    const assertionResponse = assertion.response as AuthenticatorAssertionResponse
    return apiPost('/api/auth/webauthn/login/complete', {
        challenge_token,
        credential: {
            id: assertion.id,
            rawId: bufferToBase64url(assertion.rawId),
            type: assertion.type,
            response: {
                clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
                authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
                signature: bufferToBase64url(assertionResponse.signature),
                userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
            },
        },
    })
}
