#!/bin/sh
# Renders every app icon PNG in assets/images/ from the SVG sources in assets/icon/.
# Requires rsvg-convert (librsvg) and ImageMagick 7 (`magick`).
set -eu
cd "$(dirname "$0")/.."

src=assets/icon
out=assets/images
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Splash glyph colour: palette.primary.light.
splash_color="#2f7bf5"

# Android adaptive icon layers, full 108dp canvas. The monochrome layer (Android 13+
# themed icons) is the same white glyph: the launcher only uses its alpha.
rsvg-convert -w 1024 -h 1024 "$src/glyph.svg" -o "$out/android-icon-foreground.png"
rsvg-convert -w 1024 -h 1024 "$src/glyph.svg" -o "$out/android-icon-monochrome.png"
rsvg-convert -w 1024 -h 1024 "$src/background.svg" -o "$out/android-icon-background.png"

# icon.png (iOS, legacy Android, store listing): both layers, cropped to the 72dp
# area a launcher actually shows (108dp canvas at 1536px -> centre 1024px).
rsvg-convert -w 1536 -h 1536 "$src/background.svg" -o "$tmp/bg.png"
rsvg-convert -w 1536 -h 1536 "$src/glyph.svg" -o "$tmp/fg.png"
magick "$tmp/bg.png" "$tmp/fg.png" -composite -gravity center -crop 1024x1024+0+0 +repage "$out/icon.png"

# Favicon: icon.png with rounded corners.
magick "$out/icon.png" \( -size 1024x1024 xc:none -fill white -draw "roundrectangle 0,0 1023,1023 224,224" \) \
  -compose DstIn -composite -resize 48x48 "$out/favicon.png"

# Splash: the glyph alone in the primary colour, cropped to the 72dp area.
sed "s/#ffffff/$splash_color/" "$src/glyph.svg" > "$tmp/splash.svg"
rsvg-convert -w 1536 -h 1536 "$tmp/splash.svg" -o "$tmp/splash.png"
magick "$tmp/splash.png" -gravity center -crop 1024x1024+0+0 +repage "$out/splash-icon.png"
