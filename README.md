# TRI · Print Studio

**Live: https://matt-1369.github.io/tri-print-studio/**

*For the kid who learned 3D on the donut tutorial.*

TRI is the idol of **I'm Upping My Poly(doom)**, a K-pop parody music video about AI 3D, drawn frame by frame in JavaScript as a riso print. She is also a real 3D model. This page lets you hold her:

- **Drag** to turn her, **scroll or pinch** to zoom.
- **1 · Texture**: the textured Tripo model, printed in riso inks like the rest of the video.
- **2 · Quads**: the native quad mesh, 11,040 of 11,176 faces are quads, printed live.
- **3 · Rig**: Tripo's auto-rig, 41 joints.
- **Dance**: Tripo's `dance_04` preset on the final chorus, sped up 1.42× so her hips land on every beat.
- **A / B**: fine print or clean flat colour. **Print this frame** saves a PNG.

## How TRI was made

1. **One image.** A clean A-pose front view of TRI (GPT Image 2.5), made from her model sheet.
2. **Tripo H3.1, image → 3D.** A textured model plus a native quad mesh (`quad: true`).
3. **Auto-rig.** One API call: 41 joints with skin weights (`/animations/rig`, biped).
4. **Retarget.** The `preset:biped:dance_04` animation, applied to her skeleton (`/animations/retarget`).
5. **Print.** The textured model is rendered with three.js and traced into riso ink layers (the same tracer as the music video's footage). The quad mesh is skinned by the Tripo rig on the CPU and printed live with WebGL: paper faces, halftone shading, blue quads, with the triangulation diagonal hidden in the shader.

Everything on the page is static files: plain JavaScript modules, three.js, JSON drawings, one GLB.

## Credits

Made by Matt ([@Matt_xingbao](https://x.com/Matt_xingbao)) with Claude Opus 5.5. 3D by Tripo (H3.1, auto-rig, animation presets). Footage reference Seedance 2.5. Designs GPT Image 2.5 and Nano Banana Pro. Song ElevenLabs.

Parodies all the way down: "P(doom)" by osmarks · Claude-Pop by @slimer48484 · the Opus music video by @other__reality · the one-prompt remake by @donaldjewkes.

Built for Tripothon S1 · Film / VFX.
