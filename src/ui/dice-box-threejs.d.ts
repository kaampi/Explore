declare module "@3d-dice/dice-box-threejs" {
  export default class DiceBox {
    constructor(selector: string, options?: Record<string, unknown>);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clearDice(): void;
    startClickThrow(notation:string):unknown;
    getNotationVectors(notation:string,vector:{x:number;y:number},boost:number,distance:number):unknown;
    display:{currentWidth:number;currentHeight:number};
    strength:number;
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
