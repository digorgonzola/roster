import { describe, expect, it } from 'vitest'
import { CrossSiteRequestError, UnsupportedMediaTypeError } from './errors'
import { assertJsonBody, assertSameOrigin } from './http'

const URL_ = 'https://roster.example.com/api/op'

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method, headers })
}

describe('assertSameOrigin', () => {
  it('lets plain GET requests through from anywhere', () => {
    expect(() => assertSameOrigin(request('GET', { 'sec-fetch-site': 'cross-site' }))).not.toThrow()
  })

  it('accepts a same-origin POST', () => {
    expect(() => assertSameOrigin(request('POST', { 'sec-fetch-site': 'same-origin' }))).not.toThrow()
  })

  it('rejects a cross-site POST', () => {
    expect(() => assertSameOrigin(request('POST', { 'sec-fetch-site': 'cross-site' }))).toThrow(CrossSiteRequestError)
  })

  it('rejects a cross-site WebSocket upgrade', () => {
    const upgrade = request('GET', { upgrade: 'websocket', origin: 'https://evil.example' })
    expect(() => assertSameOrigin(upgrade)).toThrow(CrossSiteRequestError)
  })

  it('accepts a same-origin WebSocket upgrade by Origin', () => {
    const upgrade = request('GET', { upgrade: 'websocket', origin: 'https://roster.example.com' })
    expect(() => assertSameOrigin(upgrade)).not.toThrow()
  })
})

describe('assertJsonBody', () => {
  it('accepts application/json with a charset', () => {
    expect(() => assertJsonBody(request('POST', { 'content-type': 'application/json; charset=utf-8' }))).not.toThrow()
  })

  it('rejects a text/plain form body', () => {
    expect(() => assertJsonBody(request('POST', { 'content-type': 'text/plain' }))).toThrow(UnsupportedMediaTypeError)
  })
})
