<div align="center">

# CONVOLAB

**Convolution art lab for macOS and Windows.**

The same convolution filter applied over its own result, frame after frame, on the GPU.
Feed it an image, a video, a drawing or text and it grows weaves, drips, coral, terraces and
fingerprints that never repeat. Render the result to ProRes, H.264 or PNG.

[Download for macOS (Apple Silicon)](https://github.com/chillithebillis/convolab/releases/latest) ·
[Download for Windows](https://github.com/chillithebillis/convolab/releases/latest)

</div>

## Install

**macOS (Apple Silicon, macOS 12+).** Download `CONVOLAB-x.y.z-mac-arm64.zip`, unzip it and move
`CONVOLAB.app` to Applications. The app is not notarized, so the first time right-click it and
choose **Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/CONVOLAB.app
```

**Windows 10/11 (x64).** Download `CONVOLAB-x.y.z-win-x64-setup.exe` and run it. It installs for
the current user and creates a desktop shortcut. SmartScreen may warn about an unknown publisher:
choose **More info → Run anyway**.

Both versions check GitHub Releases for new versions and show an **Update** button in the top bar.
**CONVOLAB ▸ Check for Updates…** checks by hand.

## What it does

- **Sources.** Drop an image or a video on the canvas (or **File ▸ Open**). Generators, drawing and
  text can also feed the simulation.
- **Presets.** 30 starting looks, from *Pyramid Weave* and *Turing Skin* to *Lenia* and
  *Machined Metal*. Save your own presets with a thumbnail.
- **Mask.** Load a black-and-white image or video as a mask (or drop it holding Option / Alt). The
  effect acts only on white, or on black in Invert mode. Works well with SAM mattes.
- **Modulation.** LFOs and audio bands (level, low, mid, high) can drive any parameter. The render
  analyses the audio frame by frame, so it matches what you see.
- **Morph A/B.** Store two states and blend between them; the blend can be modulated.
- **Keyframes.** Every parameter has a key button on the timeline, with auto-key.
- **MIDI.** MIDI Learn maps controller knobs to parameters.
- **Draw and Type.** Brush, eraser, line and shapes into the source, the simulation or the mask;
  system fonts or `.ttf` / `.otf` files.
- **Output window.** Send the canvas full screen to a second display for live shows.
- **Render.** ProRes 422 HQ, ProRes 4444, H.264 or a PNG sequence, with the source audio or a
  separate audio file. Every render writes a `.json` with its parameters next to it, and saved PNGs
  carry the parameters inside.

Presets live in `Documents/CONVOLAB/Presets`. Renders go to `Movies/CONVOLAB` (macOS) or
`Videos/CONVOLAB` (Windows), and PNGs to `Pictures/CONVOLAB`.

## Shortcuts

| Key | Action |
|---|---|
| Space / P | Play / pause |
| N | Step one iteration |
| R | Reset to the source |
| C (hold) | Show the original |
| X | Randomize |
| F | Freeze the result as the new source |
| Tab | Toggle the panel |
| 1–9 | Presets |
| D / T | Draw / move text |
| K | Key all parameters |
| Cmd/Ctrl + S | Save PNG |
| Cmd/Ctrl + R | Render |
| Cmd/Ctrl + O | Open source |

## Build from source

Requires Node.js 22.

```bash
npm ci
npm start            # run in development
npm run dist:mac     # macOS zip (on a Mac)
npm run dist:win     # Windows installer (on Windows)
```

`ffmpeg-static` provides the ffmpeg binary that is bundled with the app. Set `CONVOLAB_FFMPEG` to
use another ffmpeg.

Raising `version` in `package.json` and pushing to `main` builds both platforms on GitHub Actions
and publishes a release with the
macOS zip and the Windows installer. The in-app updater looks for those two file names.

---

by chillibillis
