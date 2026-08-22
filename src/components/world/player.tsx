import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePresence } from "@/lib/store";
import { slideMove } from "./collision";
import { sampleMove, worldInput } from "./input";
import { clearNavDestination, navAgent, stepNavAgent } from "./navmesh";

const SPEED = 3.35;
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _desired = new THREE.Vector3();

type Probe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPosition: () => { x: number; z: number };
  setKeys?: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: Probe;
  }
}

export function PlayerRig({
  pos,
  onPos,
  chatOpen,
}: {
  pos: THREE.Vector3;
  onPos: (x: number, z: number, yaw: number, speed: number) => void;
  chatOpen: boolean;
}) {
  const yaw = useRef(usePresence.getState().pose.yaw);
  const pitch = useRef(0.18);
  const speedRef = useRef(0);
  const { camera, gl } = useThree();

  useEffect(() => {
    const probe: Probe = {
      getYaw: () => yaw.current,
      getSpeed: () => speedRef.current,
      getPosition: () => ({ x: pos.x, z: pos.z }),
      setKeys: (codes) => {
        worldInput.keys.clear();
        for (const c of codes) worldInput.keys.add(c);
      },
    };
    window.__controlsTest = probe;
    return () => {
      if (window.__controlsTest === probe) delete window.__controlsTest;
    };
  }, [pos]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (!chatOpen) {
      yaw.current -= worldInput.lookDx * 0.0022;
      pitch.current -= worldInput.lookDy * 0.0018;
    }
    worldInput.lookDx = 0;
    worldInput.lookDy = 0;
    pitch.current = Math.max(-0.45, Math.min(0.55, pitch.current));

    const move = chatOpen ? { x: 0, y: 0 } : sampleMove();
    const inputMag = Math.hypot(move.x, move.y);

    // WASD/joystick cancela caminho automático
    if (inputMag > 0.08 && navAgent.active && navAgent.cancelOnInput) {
      clearNavDestination();
    }

    let nx = pos.x;
    let nz = pos.z;

    if (navAgent.active && inputMag < 0.08 && !chatOpen) {
      const step = stepNavAgent(pos.x, pos.z, SPEED, dt);
      if (step && !step.done) {
        nx = pos.x + step.dx;
        nz = pos.z + step.dz;
        // orienta o corpo na direção do caminho
        if (Math.hypot(step.dx, step.dz) > 1e-4) {
          yaw.current = Math.atan2(-step.dx, -step.dz);
        }
        speedRef.current = SPEED;
      } else {
        speedRef.current = 0;
      }
    } else {
      _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      _right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      nx = pos.x + (_fwd.x * move.y + _right.x * move.x) * SPEED * dt;
      nz = pos.z + (_fwd.z * move.y + _right.z * move.x) * SPEED * dt;
      speedRef.current = inputMag * SPEED;
    }

    const slid = slideMove(pos.x, pos.z, nx, nz);
    pos.x = slid.x;
    pos.z = slid.z;

    const dist = 4.15;
    const cp = Math.cos(pitch.current);
    _desired.set(
      pos.x + Math.sin(yaw.current) * dist * cp,
      pos.y + 1.55 + Math.sin(pitch.current) * dist,
      pos.z + Math.cos(yaw.current) * dist * cp,
    );
    camera.position.lerp(_desired, 1 - Math.exp(-8 * dt));
    _look.set(pos.x, pos.y + 1.22, pos.z);
    camera.lookAt(_look);

    onPos(pos.x, pos.z, yaw.current, speedRef.current);
  });

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
  }, [gl]);

  return null;
}
