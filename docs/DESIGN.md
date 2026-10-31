# Deskbird Visual & Art Direction Specification

Deskbird intentionally rejects generic modern AI aesthetic trends in favor of a warm, earthy, printed-paper, retro handheld game visual identity.

---

## 1. Banned Visual Patterns

The following design patterns are strictly forbidden across all Deskbird interfaces:
- ❌ **No gradients**: No purple/indigo/violet gradients, no blue-to-purple fades, no gradient text.
- ❌ **No neon colors**: No cyan, hot magenta, or neon accents.
- ❌ **No glow or bloom**: No glowing borders, neon drop shadows, or bloom effects.
- ❌ **No glassmorphism**: No frosted glass, `backdrop-filter: blur`, or semi-transparent floating bubbles.
- ❌ **No soft blurred shadows**: No `box-shadow: 0 10px 25px rgba(0,0,0,0.1)`. All shadows must be hard, flat offset blocks (`box-shadow: 4px 4px 0 #cdbf9e`).
- ❌ **No pill buttons everywhere**: No rounded pill button elements. All buttons have hard 90-degree corners or 2px stepped corners.
- ❌ **No modern generic fonts**: No Inter, Roboto, or generic sans-serif on white backgrounds.

---

## 2. The 14-Color Canonical Palette

The color system is fixed and defined as a single source of truth in `art/bird.sprites.js`:

| Role | Color Name | Hex Code | Visual Swatch Usage |
|---|---|---|---|
| Ink / Outline / Text | `#2a1f17` | `rgb(42, 31, 23)` | Outlines, typography, primary borders |
| Bird Body | Rust | `#b8663a` | `rgb(184, 102, 58)` | Bird back, plumage, primary body |
| Bird Wing / Shadow | Dark Body | `#7d3f22` | `rgb(125, 63, 34)` | Wing feathers, head crest shadow |
| Bird Belly | Cream | `#f0dfb6` | `rgb(240, 223, 182)` | Chunky robin belly, throat patch |
| Beak / Accent | Mustard | `#d9a21b` | `rgb(217, 162, 27)` | Beak, bird feet, primary buttons |
| Cheek / Alert | Tomato | `#c4452d` | `rgb(196, 69, 45)` | Rosy cheek, sender label, warnings |
| Eye Shine / Dialog Paper | Pale Cream | `#fbf3dc` | `rgb(251, 243, 220)` | Speech bubble card, eye catchlight |
| Perch Wood | Warm Walnut | `#6e4a2e` | `rgb(110, 74, 46)` | Wooden perch branch base |
| Perch Highlight | Light Oak | `#8e6a45` | `rgb(142, 106, 69)` | Upper edge wood highlight line |
| Perch Shadow | Dark Bark | `#4a3220` | `rgb(74, 50, 32)` | Lower edge branch shadow |
| Leaf Green | Forest Green | `#4f7a45` | `rgb(79, 122, 69)` | Perch branch twig leaves, online dot |
| Web Page Paper | Warm Newsprint | `#efe5cf` | `rgb(239, 229, 207)` | Web app body background |
| Muted Grey | Earth Grey | `#8a7f6c` | `rgb(138, 127, 108)` | Offline status, secondary hints |
| Hard Offset Shadow | Dark Sand | `#cdbf9e` | `rgb(205, 191, 158)` | 3px / 4px flat offset shadow blocks |

---

## 3. Typography & Fonts

Both typefaces are self-hosted using `@fontsource` packages for offline reliability:
- **Press Start 2P** (`@fontsource/press-start-2p`):
  - Used for titles, speech bubble text, badge indicators, and button labels.
  - Rendered at integer multiples of 8 DIP (8px, 16px, 24px) to avoid font rasterization blur.
- **VT323** (`@fontsource/vt323`):
  - Used for the web sender form inputs, textareas, and long body text.
  - Sized at 20px–22px for readability.

---

## 4. Perch Architecture & Ergonomics

- **Dimensions**: 168 DIP wide by 16 DIP high.
- **Placement**: Top-right corner of the primary display.
  - **Offset X**: 24 DIP from the right edge.
  - **Offset Y**: 44 DIP down from the top edge.
- **Ergonomic Design Rationale**:
  On Windows 10 and 11, maximised application windows place their Minimize, Maximize, and Close buttons directly in the top-right corner (`x: right-140..right, y: 0..40`). Placing the perch flush at `y: 0` would overlay these critical system controls and block user clicks. Positioning the perch 44 DIP below the top clears the title bar completely, ensuring no interference with normal window management.

---

## 5. Speech Bubble Specification

- **Dialogue Style**: Inspired by classic 8-bit RPGs (Mother / EarthBound, Pokémon Generation 1).
- **Construction**:
  - Border: 2 DIP solid ink `#2a1f17`.
  - Background: Flat `#fbf3dc`.
  - Offset Shadow: 4 DIP flat block `#cdbf9e`.
  - Tail: 45-degree angled stepped pixel triangle pointing directly at the bird's head.
  - Queue Counter: Blinking triangle arrow with `+N` badge when unread messages are buffered.

