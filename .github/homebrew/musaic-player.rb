cask "musaic-player" do
  version "0.5.1"
  sha256 "53df4c78c0779c2edc7555cec83400bd61347a5ffd20399e09cb21bc2b4c5f11"

  url "https://github.com/solder3t/musaic-player-linux/releases/download/v#{version}/Musaic-#{version}-Mac-arm64.dmg",
      verified: "github.com/solder3t/musaic-player-linux/"
  name "Musaic"
  desc "Music player with gapless playback, parametric EQ, and real-time DSP visualizers"
  homepage "https://github.com/solder3t/musaic-player-linux"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64

  app "Musaic.app"

  zap trash: [
    "~/Library/Application Support/Musaic",
    "~/Library/Caches/com.musaic.musicplayer",
    "~/Library/Logs/Musaic",
    "~/Library/Preferences/com.musaic.musicplayer.plist",
  ]
end
