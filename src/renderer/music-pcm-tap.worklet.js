class NexusMusicPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.exclusive = false;
    this.batchFrames = 1024;
    this.buffer = new Float32Array(this.batchFrames * 2);
    this.offset = 0;
    this.port.onmessage = event => {
      if (event.data && event.data.type === 'exclusive') {
        this.exclusive = event.data.enabled === true;
        if (!this.exclusive) this.offset = 0;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const left = input && input[0];
    const right = input && (input[1] || input[0]);
    if (!left || !right || !output || !output[0]) return true;

    const outLeft = output[0];
    const outRight = output[1] || output[0];
    if (!this.exclusive) {
      outLeft.set(left);
      if (output[1]) outRight.set(right);
      return true;
    }

    outLeft.fill(0);
    if (output[1]) outRight.fill(0);
    for (let frame = 0; frame < left.length; frame++) {
      this.buffer[this.offset++] = left[frame];
      this.buffer[this.offset++] = right[frame];
      if (this.offset >= this.buffer.length) {
        const chunk = this.buffer;
        this.buffer = new Float32Array(this.batchFrames * 2);
        this.offset = 0;
        this.port.postMessage({ type: 'pcm', pcm: chunk.buffer }, [chunk.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('nexus-music-pcm-tap', NexusMusicPcmTap);
