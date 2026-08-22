import * as THREE from "three";

function canvasTex(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 512,
) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function makeWoodTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#6a4e38";
    ctx.fillRect(0, 0, s, s);
    const plank = s / 8;
    for (let i = 0; i < 8; i++) {
      const y = i * plank;
      ctx.fillStyle = i % 2 === 0 ? "#7a5a40" : "#624832";
      ctx.fillRect(0, y, s, plank - 2);
      ctx.fillStyle = "rgba(40,24,14,0.35)";
      ctx.fillRect(0, y + plank - 2, s, 2);
      for (let k = 0; k < 18; k++) {
        ctx.strokeStyle = `rgba(40,24,14,${0.08 + Math.random() * 0.1})`;
        ctx.beginPath();
        const x0 = Math.random() * s;
        ctx.moveTo(x0, y + 4);
        ctx.bezierCurveTo(
          x0 + 40,
          y + plank * 0.4,
          x0 - 20,
          y + plank * 0.7,
          x0 + 10,
          y + plank - 4,
        );
        ctx.stroke();
      }
    }
  });
}

export function makePlasterTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#d8cfc3";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(90,70,50,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 256);
}

export function makeGrassTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#3d4a32";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = i % 3 === 0 ? "#4a5c3c" : "#2f3a28";
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.fillRect(x, y, 1, 3 + Math.random() * 4);
    }
  });
}

export function makeStoneTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#6d675e";
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 6; x++) {
        const ox = y % 2 === 0 ? 0 : s / 12;
        ctx.fillStyle = x + y === 4 ? "#7a746a" : "#5c564e";
        ctx.fillRect((x * s) / 6 + ox, (y * s) / 8, s / 6 - 3, s / 8 - 3);
      }
    }
  }, 256);
}
