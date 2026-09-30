import diceHitUrl from "@3d-dice/dice-box-threejs/public/sounds/dicehit/dicehit_plastic1.mp3?url";
import tableHitUrl from "@3d-dice/dice-box-threejs/public/sounds/surfaces/surface_felt1.mp3?url";

/** UI-only collision audio. Construct/resume directly in the Roll click
 * so browser autoplay rules permit sound after the renderer loads. */
export class DiceSound {
  private context: AudioContext | null = null;
  private dice: AudioBuffer | null = null;
  private table: AudioBuffer | null = null;
  private lastHit = -Infinity;
  private closed = false;
  private enabled: boolean;
  private active = new Set<AudioBufferSourceNode>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
    try {
      this.context = new AudioContext();
      void this.context.resume().catch(() => {});
      void this.load();
    } catch { /* Audio support never gates a check. */ }
  }

  private async load() {
    const context = this.context;
    if (!context) return;
    try {
      const load = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Dice audio unavailable");
        return context.decodeAudioData(await response.arrayBuffer());
      };
      const [dice, table] = await Promise.all([load(diceHitUrl), load(tableHitUrl)]);
      if (this.closed) return;
      this.dice = dice;
      this.table = table;
    } catch { /* Missing clips fall back to a silent roll. */ }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  hit(speed: number, diceCollision: boolean) {
    const context = this.context;
    const buffer = diceCollision ? this.dice : this.table;
    if (!this.enabled || this.closed || !context || context.state !== "running" || !buffer || speed < 250) return;
    const now = context.currentTime;
    if (now - this.lastHit < .045) return;
    this.lastHit = now;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = .9 + Math.random() * .2; // sound variation only
    gain.gain.value = Math.min(.35, speed / 12000);
    source.connect(gain);
    gain.connect(context.destination);
    this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  private stop() {
    this.active.forEach((source) => { try { source.stop(); } catch {} });
    this.active.clear();
  }

  close() {
    this.closed = true;
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
