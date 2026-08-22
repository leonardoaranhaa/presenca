# Avatares (scan + Mixamo)

## Só visual (sem animações)
```bash
npx @gltf-transform/cli optimize corpo.glb public/avatars/eu.glb --compress draco
```

## Com rig Mixamo
1. Upload do personagem em https://www.mixamo.com → Auto-Rigger  
2. Download FBX With Skin + clips Idle, Walking (e opcional Hug)  
3. Combinar/exportar GLB no Blender (Animations ligadas)  
4. `public/avatars/eu-rig.glb`  
5. App → O meu corpo → marcar **Este GLB veio do Mixamo**

Clips reconhecidos: Idle, Walk/Walking, Run, Hug, Wave, Sit.
