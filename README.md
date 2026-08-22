# Musaic Player

<p align="center">
  <img src="assets/musaic-icon-squircle.png" alt="Musaic Player" width="220" />
</p>

<p align="center">
  <strong>A premium, local-first audiophile music player for Linux, Windows, and macOS.</strong><br>
  Bit-perfect playback, real-time C++ DSP visualizers, multi-provider synced lyrics, AI translation & romanization, sub-millisecond LAN Listen Together, and rich offline listening statistics — with zero ads, zero trackers, and zero cloud dependency.
</p>

<p align="center">
  <a href="#-key-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-ai-intelligence-layer">AI Features</a> •
  <a href="#-audio-engine--dsp">Audio Engine</a> •
  <a href="#-lyrics--translation">Lyrics</a> •
  <a href="#-listening-stats">Stats</a> •
  <a href="#-development">Development</a> •
  <a href="#-credits--attribution">Credits</a>
</p>

---

> **Note**: Musaic Player is a personal fork of **[Astra](https://github.com/boof2015/Astra)**. Full credit and gratitude go to **Aastra / [@boof2015](https://github.com/boof2015)** and the original developers for creating the underlying high-performance audio engine and architecture.

---

## ✨ Key Features

### 🎵 Audiophile & Bit-Perfect Audio Engine
- **Bit-Perfect Output**: Direct hardware output via **ALSA** on Linux, **WASAPI Exclusive** on Windows, and **CoreAudio** on macOS, bypassing OS mixing and resampling.
- **Native C++ DSP Engine**: High-performance native addon (`visualizer_dsp.node`) delivering smooth 60fps/120fps real-time visualizers.
- **7 Pro Audio Visualizers**: Oscilloscope, Spectrum Analyzer, Vectorscope, VU Meter, Scope Rack, Stereo Field, and Waveform.
- **20-Band Equalizer**: Parametric and Graphic EQ with customizable Q-factor, pre-amp gain, and genre presets.
- **Spatial & Multichannel Audio**: Native **IAMF / Eclipsa 3D Spatial Audio** and Dolby Atmos decoding support.
- **Gapless & Loudness Normalization**: True gapless playback with smart pre-buffering, crossfade, and **ReplayGain 2.0** (track & album loudness matching).

### 🤖 AI Intelligence Layer (Local & Cloud)
- **Multi-Provider AI Support**: Connect to **Google Gemini, OpenAI, Anthropic Claude, Groq, DeepSeek, OpenRouter, Mistral**, or run 100% locally with offline **Ollama**.
- **Real-Time Lyric Romanization & Translation**: Instant phonetics (Romaji, Pinyin, Hangul, Cyrillic, Devanagari, Arabic) and English translation for foreign lyrics.
- **Natural Language EQ Assistant**: Describe the sound signature you want (e.g. *"Warm acoustic guitar with punchy bass and vocal air"*), and Musaic crafts a custom parametric EQ curve.
- **Interactive Quota & Rate-Limit Feedback**: Real-time error diagnostics and direct API key management with secure storage and provider-specific model presets.

### 🎤 Synchronized Multi-Provider Lyrics
- **Synced & Enhanced Lyrics**: Word-by-word synced syllable karaoke timing (Enhanced LRC / XLRC) and line-synced scrolling.
- **Multi-Provider Fetching**: Automatic querying across **XLRCDB, LRCLIB, Genius, and Musixmatch** with local embedded tag fallback.
- **Online Lyrics Search & Chooser**: Interactive modal to preview, compare, and select lyrics across all online providers if automatic matching picks the wrong version.
- **Sidecar & Local File Support**: Read and save local `.lrc` and `.xlrc` sidecar files directly alongside your music files.

### 📊 Local-First Listening Statistics & Scrobbling
- **Private Listening Dashboard**: Comprehensive analytics on total listening time, qualified play counts, active days, and track diversity across customizable time ranges (7 Days, 30 Days, 3 Months, 6 Months, 1 Year, All Time).
- **Top Rankings**: Ranked Top Tracks, Top Artists, and Top Albums with instant toggling between play count and listening time ranking metrics.
- **Interactive Activity Charts**: Beautiful animated bar charts tracking daily listening volume with date-range stepping.
- **Shareable Snapshots**: Generate polished image snapshots of your listening summaries to share with friends.
- **Full Last.fm Integration**: Real-time scrobbling, Now Playing updates, and two-way track love/favorite sync.

### 🌌 Music Mood Nebula & Smart Library
- **2D/3D Mood Nebula**: Interactive visual galaxy mapping your entire music collection across Valence (positivity) and Energy/Excitement coordinates.
- **Cluster Playlists**: Click any star cluster in the Nebula to generate instant mood-tailored playlists.
- **Dynamic Smart Playlists**: Live rule-based filtering by genre, rating, year, last played, BPM, play count, and file properties.
- **Subsonic / Navidrome / Airsonic**: Connect and stream remote music servers with automatic offline caching and bidirectional playlist sync.
- **Advanced Metadata & Tag Editor**: Multi-tag editing, collaborative artist split recognition, album art embedding, and case-folding directory sync.

### 🎧 Listen Together & Mobile Remote (Powered by Parallax)
- **Sub-Millisecond Multi-Room Sync**: Stream synchronized audio across multiple PCs, laptops, and Raspberry Pi devices on your LAN.
- **Collaborative Queue**: Guests can browse the host's library, suggest tracks, and upvote/downvote the upcoming queue.
- **Phone Remote**: Control playback from any smartphone browser via secure local HTTPS and instant QR code / PIN pairing.

### 🎨 Modern Design & Theming
- **Dynamic Themes**:
  - **AMOLED True Black**: Deep contrast optimized for OLED displays.
  - **Glassmorphism Frosted Glass**: Modern translucent acrylic aesthetic with real-time backdrop blur.
  - **Neon Nebula Glow**: Vibrant ambient gradients synced to your listening mood.
  - **Material You**: Dynamic color palette extracted live from the active album artwork.
- **Floating Mini-Player**: Compact, distraction-free floating widget with pinned controls and album art.
- **Native OS Integration**: Desktop media notifications, taskbar controls, and media keys via **MPRIS** on Linux, **SMTC** on Windows, and **Now Playing** on macOS.

---

## 🚀 Installation

### Linux
Download the latest `.AppImage`, `.deb`, `.rpm`, or `.tar.gz` from the [Releases](https://github.com/solder3t/musaic-player-pc/releases) page.

```bash
# AppImage
chmod +x musaic-player-*.AppImage
./musaic-player-*.AppImage

# Debian / Ubuntu
sudo dpkg -i musaic-player_*_amd64.deb

# Arch Linux (AUR)
yay -S musaic-player-bin
```

### Windows
Download the Windows installer (`.exe`) or portable archive from the [Releases](https://github.com/solder3t/musaic-player-pc/releases) page.

### macOS
Download the `.dmg` package from the [Releases](https://github.com/solder3t/musaic-player-pc/releases) page.

```bash
# macOS Homebrew (Cask)
brew install --cask solder3t/tap/musaic-player
```

---

## 🛠️ Development & Building

### Prerequisites
- **Node.js**: `24.x` recommended (minimum Node.js `20+`)
- **Python 3** & **C++ Build Tools** (for compiling the native DSP and SQLite addons)
  - **Linux**: `build-essential`, `python3`, `libasound2-dev`
  - **Windows**: Visual Studio 2022 C++ build tools
  - **macOS**: Xcode Command Line Tools

### Setup & Run
```bash
# 1. Clone the repository
git clone https://github.com/solder3t/musaic-player-pc.git
cd musaic-player-pc

# 2. Install dependencies and compile native C++ DSP module
npm install

# 3. Start development server with hot-reload
npm run dev
```

### Testing & Verification
```bash
# Run TypeScript typecheck
npm run typecheck

# Run full test suite
npm test

# Run SQLite & database integrity tests
npm run test:library-sqlite
```

### Packaging & Distribution
```bash
# Build for current OS
npm run build && npm run dist

# Target specific platforms
npm run dist:linux    # AppImage, DEB, RPM, tar.gz
npm run dist:win      # Windows Installer (NSIS)
npm run dist:mac      # macOS DMG
```

---

## 📜 Credits & Attribution

Musaic Player is developed and maintained by **solder3t** (`sold3vs@gmail.com`) as a personal fork of **Astra**.

We extend our deepest gratitude and recognition to **Aastra / boof2015** and the original Astra developers for creating such an exceptional, local-first audiophile music player foundation and high-performance audio architecture.

---

## ⚖️ License

Musaic Player is licensed under the **GNU General Public License v3.0** ([GPL-3.0-only](file:///home/adityas/Projects/applications/linux/musaic-player/LICENSE)).
