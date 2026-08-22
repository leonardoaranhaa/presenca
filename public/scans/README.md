# Scans GLB

Coloque aqui os arquivos otimizados da casa real:

```bash
npx @gltf-transform/cli optimize casa.glb casa-web.glb --compress draco --texture-compress webp
cp casa-web.glb public/scans/
```

No lugar (`Place.scan.glbUrl`): `/scans/casa-web.glb`
