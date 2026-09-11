declare module 'playcanvas/scripts/esm/first-person-controller.mjs' {
  import type { Script } from 'playcanvas';

  export class FirstPersonController extends Script {
    static scriptName: string;
    lookSens: number;
    speedGround: number;
    speedAir: number;
    sprintMult: number;
    velocityDampingGround: number;
    velocityDampingAir: number;
    jumpForce: number;
  }
}
