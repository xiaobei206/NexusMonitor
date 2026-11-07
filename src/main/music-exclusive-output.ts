import { app } from 'electron';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { MusicTrack } from '../shared/types';
import { chooseExclusiveFormat, classifyExclusiveSource } from './music-exclusive-format';
import type { ExclusiveDeviceFormat, ExclusiveNegotiatedFormat } from './music-exclusive-format';

export interface WasapiOutputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}
export interface WasapiNativeStatus {
  open: boolean;
  ready: boolean;
  openError: string;
  deviceName: string;
  format: string;
  sampleRate: number;
  running: boolean;
  bufferedBytes: number;
  underruns: number;
  framesRendered: number;
  acceptedBytes: number;
  droppedFrames: number;
  error: string;
}
interface WasapiNativeAddon {
  listDevices(): WasapiOutputDevice[];
  probeDevice(deviceId?: string): { name: string; formats: ExclusiveDeviceFormat[] };
  open(options: { deviceId: string; sampleRate: number; format: string }): { pending: boolean };
  start(): boolean;
  stop(): boolean;
  write(pcm: Buffer): number;
  clear(): boolean;
  stats(): WasapiNativeStatus;
  close(): boolean;
}
export interface WasapiOpenResult {
  deviceName: string;
  format: string;
  sampleRate: number;
  channels: 2;
  bytesPerFrame: number;
  exclusive: true;
  transport: 'renderer-float32-pcm';
  bitPerfect: false;
  bitPerfectCandidate: boolean;
  negotiated: ExclusiveNegotiatedFormat;
}
const OPEN_TIMEOUT_MS = 8000;
const OPEN_POLL_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Owns one native Windows WASAPI exclusive output stream.
 *
 * The current source transport will feed this engine from the app's Web Audio
 * renderer tap, so this is a dedicated exclusive endpoint path but is not
 * bit-perfect. A later direct decoder-to-native path may use the same format
 * negotiation helper and qualify independently.
 */
export class MusicExclusiveOutput {
  private addon: WasapiNativeAddon | null = null;
  private loadAttempted = false;
  private loadMessage = 'WASAPI native module has not been loaded.';
  private negotiated: ExclusiveNegotiatedFormat | null = null;

  private resolveAddon(): WasapiNativeAddon | null {
    if (this.loadAttempted) return this.addon;
    this.loadAttempted = true;
    if (process.platform !== 'win32') {
      this.loadMessage = 'WASAPI exclusive output is available only on Windows.';
      return null;
    }
    const nativePath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'wasapi-output', 'nexus_wasapi.node')
      : join(app.getAppPath(), 'native', 'wasapi-output', 'build', 'Release', 'nexus_wasapi.node');
    if (!existsSync(nativePath)) {
      this.loadMessage = `Native WASAPI addon is not built: ${nativePath}`;
      return null;
    }
    try {
      const requireFromMain = createRequire(__filename);
      this.addon = requireFromMain(nativePath) as WasapiNativeAddon;
      this.loadMessage = '';
    } catch (error) {
      this.loadMessage = `Unable to load WASAPI addon: ${error instanceof Error ? error.message : String(error)}`;
      this.addon = null;
    }
    return this.addon;
  }

  availability(): { available: boolean; message: string } {
    const addon = this.resolveAddon();
    return addon
      ? { available: true, message: 'Native WASAPI module loaded.' }
      : { available: false, message: this.loadMessage };
  }

  listDevices(): WasapiOutputDevice[] {
    const addon = this.resolveAddon();
    if (!addon) throw new Error(this.loadMessage);
    return addon.listDevices();
  }

  probeDevice(deviceId: string): { name: string; formats: ExclusiveDeviceFormat[] } {
    const addon = this.resolveAddon();
    if (!addon) throw new Error(this.loadMessage);
    return addon.probeDevice(deviceId);
  }

  async openForTrack(deviceId: string, track: MusicTrack, transportSampleRate?: number): Promise<WasapiOpenResult> {
    this.close();
    const addon = this.resolveAddon();
    if (!addon) throw new Error(this.loadMessage);
    if (!deviceId.trim()) throw new Error('Select a Windows audio endpoint before opening WASAPI exclusive output.');

    const source = classifyExclusiveSource(track);
    const probe = addon.probeDevice(deviceId);
    const negotiated = chooseExclusiveFormat(source, probe.formats, transportSampleRate);
    if (!negotiated) {
      throw new Error(`No supported stereo exclusive PCM format was reported by “${probe.name}”.`);
    }

    const request = addon.open({
      deviceId,
      sampleRate: negotiated.sampleRate,
      format: negotiated.format,
    });
    if (!request?.pending) {
      addon.close();
      throw new Error('Native WASAPI addon did not begin opening the endpoint.');
    }

    const deadline = Date.now() + OPEN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const status = addon.stats();
      if (status.openError) {
        addon.close();
        throw new Error(status.openError);
      }
      if (status.ready) {
        if (!status.open || status.sampleRate !== negotiated.sampleRate || status.format !== negotiated.format) {
          addon.close();
          throw new Error('The endpoint opened with a format different from the probed exclusive format.');
        }
        this.negotiated = negotiated;
        return {
          deviceName: status.deviceName || probe.name,
          format: negotiated.format,
          sampleRate: negotiated.sampleRate,
          channels: 2,
          bytesPerFrame: negotiated.format === 's16' ? 4 : negotiated.format === 's24' ? 6 : 8,
          exclusive: true,
          transport: 'renderer-float32-pcm',
          bitPerfect: false,
          bitPerfectCandidate: negotiated.bitPerfect,
          negotiated,
        };
      }
      await delay(OPEN_POLL_MS);
    }
    addon.close();
    throw new Error('Timed out while waiting for Windows to open the exclusive audio endpoint.');
  }

  start(): void {
    const addon = this.resolveAddon();
    if (!addon) throw new Error(this.loadMessage);
    addon.start();
  }

  pause(): void {
    this.addon?.stop();
  }

  clear(): void {
    this.addon?.clear();
  }

  writeFloat32Pcm(data: Uint8Array): number {
    const addon = this.resolveAddon();
    if (!addon) throw new Error(this.loadMessage);
    if (data.byteLength % 8 !== 0) throw new Error('Exclusive PCM data must be stereo float32 and frame-aligned.');
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return addon.write(buffer);
  }

  status(): WasapiNativeStatus | null {
    return this.addon?.stats() ?? null;
  }

  currentNegotiation(): ExclusiveNegotiatedFormat | null {
    return this.negotiated;
  }

  close(): void {
    this.addon?.close();
    this.negotiated = null;
  }
}
