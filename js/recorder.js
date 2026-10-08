// Export: records the canvas (and the score, when sound is on) to a video
// file, and saves still frames.

const MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.rec = null;
  }

  get supported() {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas.captureStream === 'function';
  }

  get recording() {
    return Boolean(this.rec && this.rec.state === 'recording');
  }

  start(audioStream, name = 'turner-lumieres') {
    const stream = this.canvas.captureStream(30);
    if (audioStream) for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 14e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type }), `${name}.${ext}`);
      for (const track of stream.getVideoTracks()) track.stop();
    };
    rec.start(500);
    this.rec = rec;
  }

  stop() {
    if (this.recording) this.rec.stop();
    this.rec = null;
  }

  // Must be called right after a frame is drawn, before the browser clears
  // the drawing buffer.
  snapshot(name = 'turner-lumieres') {
    this.canvas.toBlob((blob) => blob && download(blob, `${name}.png`), 'image/png');
  }
}
