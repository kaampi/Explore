declare module "@3d-dice/dice-box-threejs" {
  export default class DiceBox {
    constructor(selector: string, options?: Record<string, unknown>);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clearDice(): void;
    resizeWorld(): void;
    setDimensions(size: { x: number; y: number }): void;
    running: boolean | number;
    rolling: boolean;
    animstate: string;
    eventCollide(event: {
      body?: { mass: number; velocity: { length(): number } };
      target?: { velocity: { length(): number } };
    }): void;
    scene: { traverse: (visit: (object: {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | Array<{ dispose(): void }>;
    }) => void) => void };
    renderer?: { dispose(): void; forceContextLoss(): void };
  }
}
