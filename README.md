# Turner lumières

An immersive, animated painting program in the manner of the Carrières des Lumières shows in Les Baux-de-Provence, built around the paintings of J. M. W. Turner. It runs in the browser on WebGL2, with no build step and no dependencies.

The painting on the wall moves the way the Van Gogh show moved: the strokes churn, the water ripples, light breathes, mist drifts, snow spirals into a vortex, and each work paints itself in or dissolves into the next. Visitors can swap the paintings, add their own, retune every effect, walk around a simulated quarry hall, and export the result as a video.

## Running it

Any static file server works. The command has to run from the root of a checkout that contains this folder, since the path is relative:

```bash
git clone https://github.com/aapostoliadis/akis.git
cd akis
npx http-server public/turner-lumieres -p 8090 -c-1
# then open http://localhost:8090
```

If the port is taken (`EADDRINUSE`), pick any other free port. `-c-1` turns off caching so edits show on reload.

Inside the Next.js app the same files are served from `public/`, so `pnpm dev` exposes it at `http://localhost:3000/turner-lumieres/index.html`.

The Turner reproductions are fetched at runtime from Wikimedia Commons (`upload.wikimedia.org` sends CORS headers, so WebGL can read the pixels). If the network blocks Wikimedia, each painting falls back to a procedural "study" painted in the browser, clearly labelled as such, so the show still runs offline.

Useful URL parameters: `?painting=temeraire` starts on a given work, `?view=room` opens the quarry view, `?autoplay=0` starts paused.

## Reverse engineering the Carrières des Lumières shows

The Van Gogh programme ("Van Gogh, la nuit étoilée", 2019 to 2020) was produced by Culturespaces with Gianfranco Iannuzzi, Renato Gatto and Massimiliano Siccardi, music by Luca Longobardi. Culturespaces calls its process AMIEX (Art and Music Immersive Experience): thousands of digitised images of artworks, projected in very high resolution across roughly 7,000 m² of quarry walls, pillars and floor, set in motion and cut to the music. The official page could not be reached from the environment this was built in, so the analysis below is drawn from published descriptions of the show and the well documented visual language of the Lumières productions.

Watching how a still painting becomes forty seconds of moving image, the productions lean on a small set of repeatable techniques.

**The painting is material, not a framed object.** A canvas is enlarged until a single brushstroke is taller than a visitor, cropped to a detail, repeated or mirrored across neighbouring walls, and continued onto the floor. Nothing is shown at its real size or in its frame.

**Motion comes from the brushwork itself.** The famous effect of the Starry Night show is that the sky swirls in the direction Van Gogh painted it. The paint moves along its own strokes rather than as a rigid image, which is why it feels painted rather than animated.

**The painting is broken into layers.** Each work is separated into planes (skies, water, foliage and ground, figures, the texture of the brushwork) so each part can move on its own: clouds shift gently, water ripples, light drifts, paint swirls. The planes follow the slow virtual camera at slightly different speeds, and that parallax suggests depth on a flat canvas. The motion stays faithful to the painter's hand rather than turning the work into something else.

**Elements are cut out and set moving.** Boats glide or pitch on the swell, a sun rises, a train runs toward the visitors. A studio rotoscopes each object, repaints the background behind it and animates the cut-out as its own layer, often with a perspective scale so it seems to come out of the wall.

**Small living elements are added sparingly.** Water shimmers, clouds and smoke drift, flames flicker, petals or snow fall, windows light up at night. They are always tinted by and blended into the painting so they read as paint.

**Light is the protagonist.** Glows bloom and breathe, rays fan out, and whole walls brighten and darken with the music.

**The painting paints itself.** Works often arrive as if being painted: colour first, then the strokes, sweeping across the wall.

**Transitions are part of the show.** Works dissolve into each other through brushstroke wipes, ink and watercolour bleeds, floods of light, melting or flowing paint, fragmentation into tiles, and cuts through darkness.

**Chapters and music drive the edit.** The programme is structured as a narrative of themes or periods, each chapter introduced by a title, with imagery timed to a score and the music tempo deliberately offset from the image tempo.

## How this program reproduces each technique

Each painting carries a "score" (a recipe of parameters) that a single fragment shader turns into the moving image. Instead of rotoscoping layers by hand as a studio would, the program estimates what it needs from the pixels when the painting loads.

| Show technique | How it is done here | Where |
| --- | --- | --- |
| Paint flows along its strokes | Structure tensor of the image gives stroke direction and coherence; a guide field (wind plus an optional spiral vortex) is projected onto the stroke direction, and the paint is advected with a two-phase looping flow map. The projection `d · dot(d, g)` is immune to the 180° ambiguity of a stroke. | `analysis.js`, `flowAt` in `shaders.js` |
| Layer separation | Sky, water and land are separated per painting: the sky is modelled row by row from the colours above the horizon (Turner's skies change with height), the water from the calm, horizontally stroked band below it, and whatever neither explains is land. Land above the horizon has to stand on the ground or the water, so a storm cloud stays in the sky and a ship or a castle does not. Each layer is continued behind the others with a push-pull fill. The editor can show the layers as a tint. | `layers.js` |
| Layer motion | Clouds drift with the wind and swirl along their strokes (fine detail such as rigging is held still), water ripples in perspective, foliage stirs in gusts, the brush texture is separated from the colour masses and nudged along each stroke, and soft passes of light drift across land and water. | scene shader |
| Parallax between layers | Each plane follows the camera by its own amount: the sky least, the water more, the land and figures fully, plus a small look-around with the pointer. Where the separation is unsure the far layer shows only its soft fill, so nothing is seen twice when the planes slide apart. | `layerViews` in `main.js`, scene shader |
| Slow camera | A long push toward the focal point (by default the light source), then an easing pull back. | `cameraAt` in `main.js` |
| Water | Perspective-correct ripples below the horizon, stronger toward the viewer. | scene shader |
| Mist, smoke, steam | Domain-warped noise tinted by a heavily blurred mip of the painting, densest at the horizon; a plume rises from a point and bends with the wind. | scene shader |
| Fire | Warm bright areas flicker and glow; embers rise above them. | scene shader |
| Rain and snow | Procedural streaks at an angle; snow falls from top to bottom at three depths (near flakes larger and faster), swaying a little and slanting with the wind. | scene shader |
| Light | Breathing glow and god rays marched toward the light through a blurred bright pass, screen-blended so highlights never clip flat. | scene shader |
| Painting paints itself | Two-stage reveal along a line-integral-convolution stroke map: colour washes first, then the strokes, spreading out from the light. | `analysis.js`, scene shader |
| Transitions | Brushstroke wipe, watercolour bleed, flood of light, paint flowing away, through darkness, mosaic tiles. The outgoing frame is frozen into a texture and dissolved over the live new painting. | `transition` in `shaders.js` |
| Chapters and titles | Five chapters (Dawn, The sea, Tempest, Fire and speed, Light and colour) with title cards drawn into a texture so recordings include them. | `paintings.js`, `drawTitle` in `main.js` |
| Music | A generative WebAudio score per mood (pads, sea or wind, bells, fire crackle, a train pulse) inside a long synthetic reverb; its level, or the level of a track you load, makes the light pulse. | `audio.js` |
| The quarry | A ray-traced limestone hall with pillars and visitor silhouettes; the frame wraps around it from a central projector, mirrored so it is seamless, with a darkened mirror on the floor. | `ROOM_FRAG` in `shaders.js` |
| Moving elements | Each element is snapped onto the most distinct dark or bright mass near its hint, matted against the background colours found on its own side of a ring around it, and lifted onto its own layer. The hole is repainted with a push-pull fill blended with a directional fill that carries lines such as a viaduct across the gap. The layer then moves on the GPU: a perspective approach from a vanishing point estimated from the strokes around it (with motion blur), a drift, rocking about the waterline, rising or setting, or pulsing. | `elements.js`, `elementColor` in `shaders.js` |
| Visitor interaction | The pointer stirs the wet paint through a self-advecting displacement field. | `DISP_FRAG` in `shaders.js` |

## The Turner programme

| Chapter | Painting | What moves |
| --- | --- | --- |
| I. Dawn | Ulysses Deriding Polyphemus (1829) | The sun climbs out of the sea, the galleon sways from its waterline, golden rays, flood-of-light entrance |
| I. Dawn | Norham Castle, Sunrise (c. 1845) | The sun rises over the castle, dense drifting mist, watercolour bleed |
| II. The sea | The Fighting Temeraire (1839) | The tug chugs with its smoke plume, the sun sinks, sunset rays, water |
| II. The sea | The Slave Ship (1840) | The ship pitches in the swell, churning sea, spray, red sky flicker |
| III. Tempest | Snow Storm, Steam-Boat off a Harbour's Mouth (1842) | The steam-boat rolls in the vortex, snow and spray spiralling around it |
| III. Tempest | Snow Storm, Hannibal and his Army Crossing the Alps (1812) | The pale sun sinks behind the storm arc, driving snow |
| IV. Fire and speed | The Burning of the Houses of Lords and Commons (1834) | Flickering fire, rising embers, reflections on the Thames |
| IV. Fire and speed | Rain, Steam and Speed (1844) | The locomotive runs along the viaduct toward the viewer with its steam, slanting rain, mist |
| V. Light and colour | Light and Colour (Goethe's Theory) (1843) | The heart of the vortex of light breathes, the strongest glow of the show |

## Making your own animated painting

Pick a painting in the gallery, or press **Your painting** to drop in any image file or paste an image address. The program analyses it and writes a starting score, finding the light source and horizon and switching fire on for warm, bright images.

Press **Edit** to shape it. The painting is fitted beside the panel with markers for the light (outer ring), the vortex, the camera focus (inner dot), the smoke source and the horizon line; drag them into place. The sliders cover stroke flow, wind, vortex, the layers (clouds drift, foliage stirs, brush texture, drifting light, depth between layers), glow, rays, water, mist, smoke, rain, snow, fire, embers, camera push, time on the wall, the entrance transition and the score. **Show the layers** tints the sky blue, the water teal and the land green; dragging the horizon re-separates them. Edits are saved in the browser for that painting, and **Export** and **Import** move a score between machines as JSON.

Under **Moving elements**, press **Add moving element**, drag its numbered marker onto an object and choose how it moves: comes toward the viewer, drifts across, rocks on the waves, rises or sets, or pulses. The dashed outline is the area that is cut; the **Size** slider fits it to the object and **Motion** sets how much it moves. An element that comes toward the viewer gets a second marker (⊙) for the point it comes from. Compact objects that stand out from their surroundings (a dark boat on bright water, a sun in haze) cut best; an object painted in the same colours as what surrounds it moves only partly.

**Quarry view** shows the work wrapped around the hall (drag to look around). **Record** saves a WebM video of the canvas, with the score when sound is on, and the ◉ button saves a still. Keyboard: arrows change painting, space plays or pauses, E edits, V switches view, S toggles sound, R records, F goes fullscreen, H hides the interface.

## Files

`index.html` and `styles.css` hold the page. In `js/`, `main.js` runs the show (loading, sequencing, camera, titles, input), `paintings.js` is the catalogue and the scores, `analysis.js` measures strokes, depth, light and horizon, `layers.js` separates sky, water and land, `elements.js` cuts out and animates the moving elements, `loader.js` fetches images and paints the offline studies, `shaders.js` contains every GLSL pass, `renderer.js` drives WebGL2, `audio.js` is the generative score, `recorder.js` exports video and stills, and `ui.js` builds the gallery, editor and markers.

## Notes and limits

Images added by address only work when the host allows cross-origin use; adding the file itself always works. Paintings you add live for the session (their scores persist in the browser). The program adapts its internal resolution when a GPU struggles, and respects the reduced-motion preference with gentler flow and camera moves. Performance is best in a recent Chromium-based browser or Safari on a machine with a dedicated or recent integrated GPU.

Paintings by J. M. W. Turner (1775 to 1851) are in the public domain; the reproductions are hosted by Wikimedia Commons. Carrières des Lumières, Culturespaces and AMIEX are referred to only to describe the techniques studied; this project is not affiliated with them.
