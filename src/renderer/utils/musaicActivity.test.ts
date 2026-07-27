import assert from 'node:assert/strict'
import test from 'node:test'
import type { ParallaxConnectedSinkState, ParallaxStatus } from '../../types/parallax.ts'
import {
  isParallaxConnectionActive,
  resolveMusaicActivityEvent,
  resolveMusaicActivityState,
  type MusaicActivityEventFlags,
} from './musaicActivity.ts'

const emptyEvents: MusaicActivityEventFlags = {
  metadataSaving: false,
  externalConnected: false,
  attention: false,
}

function makeParallaxStatus({
  connectedSinks = [],
  sinkConnected = false,
  sinkHostReachable = true,
}: {
  connectedSinks?: ParallaxConnectedSinkState[]
  sinkConnected?: boolean
  sinkHostReachable?: boolean
} = {}): ParallaxStatus {
  return {
    role: sinkConnected ? 'sink' : 'host',
    host: {
      enabled: true,
      active: true,
      bindHost: '0.0.0.0',
      port: 38403,
      lanUrls: [],
      pairedSinkCount: connectedSinks.length,
      connectedSinkCount: connectedSinks.filter((sink) => sink.online).length,
      activePlaybackSinkCount: connectedSinks.filter((sink) => sink.online && sink.playbackEnabled).length,
      activeStream: null,
      lastError: null,
      connectedSinks,
    },
    sink: {
      connected: sinkConnected,
      hostReachable: sinkHostReachable,
      baseUrl: null,
      sinkId: null,
      activeStream: null,
      clockOffsetMs: null,
      rttMs: null,
      lastError: null,
    },
  }
}

function makeConnectedSink(online: boolean): ParallaxConnectedSinkState {
  return {
    sinkId: online ? 'online-sink' : 'offline-sink',
    name: online ? 'Online sink' : 'Offline sink',
    online,
    playbackEnabled: true,
    outputDeviceId: null,
    outputDeviceLabel: null,
    appliedAdvanceMs: 0,
    lastSeenAt: null,
  }
}

test('Parallax connection predicate requires an online host sink or reachable sink host', () => {
  assert.equal(isParallaxConnectionActive(null), false)
  assert.equal(isParallaxConnectionActive(makeParallaxStatus({
    connectedSinks: [makeConnectedSink(false)],
  })), false)
  assert.equal(isParallaxConnectionActive(makeParallaxStatus({
    connectedSinks: [makeConnectedSink(false), makeConnectedSink(true)],
  })), true)
  assert.equal(isParallaxConnectionActive(makeParallaxStatus({
    sinkConnected: true,
    sinkHostReachable: true,
  })), true)
  assert.equal(isParallaxConnectionActive(makeParallaxStatus({
    sinkConnected: true,
    sinkHostReachable: false,
  })), false)
})

test('activity resolver gives scan states priority over playback', () => {
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isLibraryScanning: true,
    isRemoteSyncing: true,
  }), 'library-scan')

  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isIntegrityScanning: true,
    isLibraryScanning: true,
  }), 'integrity-scan')
})

test('activity resolver orders remote sync, loading, streaming, lookup, and playback', () => {
  assert.equal(resolveMusaicActivityState({
    playbackState: 'loading',
    isRemoteSyncing: true,
    isRemoteStreaming: true,
  }), 'remote-sync')

  assert.equal(resolveMusaicActivityState({
    playbackState: 'loading',
    isRemoteStreaming: true,
  }), 'loading-track')

  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isRemoteStreaming: true,
    isLyricsLookup: true,
  }), 'remote-streaming')

  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isLyricsLookup: true,
  }), 'lyrics-lookup')

  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isInternetLookup: true,
  }), 'lyrics-lookup')
})

test('activity resolver falls back to playback and idle states', () => {
  assert.equal(resolveMusaicActivityState({ playbackState: 'playing' }), 'playing')
  assert.equal(resolveMusaicActivityState({ playbackState: 'paused' }), 'paused')
  assert.equal(resolveMusaicActivityState({ playbackState: 'stopped' }), 'idle')
})

test('Parallax connection replaces playback and idle baseline states', () => {
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
  }), 'parallax-connected')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'paused',
    isParallaxConnected: true,
  }), 'parallax-connected')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'stopped',
    isParallaxConnected: true,
  }), 'parallax-connected')
})

test('active work takes priority over the Parallax connection baseline', () => {
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
    isIntegrityScanning: true,
  }), 'integrity-scan')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
    isLibraryScanning: true,
  }), 'library-scan')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
    isRemoteSyncing: true,
  }), 'remote-sync')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'loading',
    isParallaxConnected: true,
  }), 'loading-track')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
    isRemoteStreaming: true,
  }), 'remote-streaming')
  assert.equal(resolveMusaicActivityState({
    playbackState: 'playing',
    isParallaxConnected: true,
    isInternetLookup: true,
  }), 'lyrics-lookup')
})

test('activity event resolver emits only rising edge events by priority', () => {
  assert.equal(resolveMusaicActivityEvent({
    metadataSaving: true,
    externalConnected: true,
    attention: true,
  }, emptyEvents), 'attention')

  assert.equal(resolveMusaicActivityEvent({
    metadataSaving: true,
    externalConnected: true,
    attention: false,
  }, emptyEvents), 'metadata-saving')

  assert.equal(resolveMusaicActivityEvent({
    metadataSaving: false,
    externalConnected: true,
    attention: false,
  }, emptyEvents), 'external-connected')
})

test('activity event resolver suppresses persistent event flags', () => {
  assert.equal(resolveMusaicActivityEvent({
    metadataSaving: true,
    externalConnected: false,
    attention: false,
  }, {
    metadataSaving: true,
    externalConnected: false,
    attention: false,
  }), null)
})
