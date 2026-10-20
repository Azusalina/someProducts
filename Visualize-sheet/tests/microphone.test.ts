// @vitest-environment jsdom
import {afterEach, expect, test, vi} from 'vitest';
import {MicrophoneInput} from '../src/microphone';

let resolveStream: ((stream: MediaStream) => void) | undefined;
let rejectStream: ((error: Error) => void) | undefined;
const stop = vi.fn(), ended = vi.fn();
const stream = {getTracks:() => [{stop,addEventListener:ended}]} as unknown as MediaStream;
const contexts: FakeContext[] = [];
class FakeContext {
  state = 'suspended'; sampleRate = 48000;
  resume = vi.fn(async () => {this.state = 'running';});
  close = vi.fn(async () => {this.state = 'closed';});
  constructor() {contexts.push(this);}
  createMediaStreamSource = vi.fn(() => ({connect:vi.fn(),disconnect:vi.fn()}));
  createAnalyser = vi.fn(() => ({fftSize:0,connect:vi.fn(),disconnect:vi.fn(),getFloatTimeDomainData:(data:Float32Array) => data.fill(0)}));
  createGain = vi.fn(() => ({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()}));
  addEventListener = vi.fn();
  destination = {};
}
function setup() {
  vi.useFakeTimers(); vi.stubGlobal('AudioContext',FakeContext);
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(() => new Promise<MediaStream>((resolve,reject) => {resolveStream=resolve;rejectStream=reject;}))}});
  return new MicrophoneInput();
}
afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();contexts.length=0;});
test('does not request access until explicitly started; captures into a muted graph and stops tracks', async () => {
  const mic = setup(), reading = vi.fn();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  const pending = mic.start(reading,vi.fn()); resolveStream!(stream); expect(await pending).toBe(true);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  expect(contexts[0].createGain.mock.results[0].value.gain.value).toBe(0);
  vi.advanceTimersByTime(70); expect(reading).toHaveBeenCalledTimes(2);
  mic.stop(); expect(stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(100); expect(reading).toHaveBeenCalledTimes(2);
});
test('cancelling while permission is pending disposes a late stream and never starts analysis', async () => {
  const mic=setup(),reading=vi.fn(); const pending=mic.start(reading,vi.fn()); mic.stop();
  resolveStream!(stream); expect(await pending).toBe(false);
  expect(stop).toHaveBeenCalledOnce(); expect(contexts[0].createMediaStreamSource).not.toHaveBeenCalled();
  vi.advanceTimersByTime(500); expect(reading).not.toHaveBeenCalled();
});
test('permission denial closes the audio context and yields a useful error', async () => {
  const mic=setup(),pending=mic.start(vi.fn(),vi.fn());
  rejectStream!(new DOMException('denied','NotAllowedError'));
  await expect(pending).rejects.toThrow('未获得麦克风权限'); expect(contexts[0].close).toHaveBeenCalledOnce();
});
test('a physically disconnected track closes capture and notifies the UI', async () => {
  const mic=setup(),onEnd=vi.fn(),pending=mic.start(vi.fn(),onEnd);resolveStream!(stream);await pending;
  ended.mock.calls[0][1](); expect(stop).toHaveBeenCalledOnce(); expect(onEnd).toHaveBeenCalledWith('麦克风已断开');
});
