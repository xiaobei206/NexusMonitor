const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const main = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
const preload = readFileSync(join(__dirname, '..', 'src', 'preload', 'index.ts'), 'utf8');
const types = readFileSync(join(__dirname, '..', 'src', 'shared', 'types.ts'), 'utf8');

test('Turing supports monitor and native local wallpaper modes', () => {
  assert.match(types, /turingDisplayMode\?: 'monitor' \| 'wallpaper'/);
  assert.match(app, /硬件监控/);
  assert.match(app, /静态壁纸/);
  assert.match(app, /选择一张图片/);
  assert.match(app, /选择照片目录/);
});

test('wallpaper source, slideshow interval and fit mode persist in settings', () => {
  assert.match(types, /turingWallpaperFile\?: string/);
  assert.match(types, /turingWallpaperDirectory\?: string/);
  assert.match(types, /turingWallpaperFit\?: 'contain' \| 'cover' \| 'stretch'/);
  assert.match(app, /turingWallpaperIntervalSeconds\?\?30/);
  assert.match(app, /每 30 秒/);
  assert.match(app, /完整显示/);
  assert.match(app, /铺满裁切/);
  assert.match(app, /强制拉伸/);
  assert.match(app, /const scale=wallpaperFit==='cover'/);
});

test('wallpaper file handling stays local and filters supported raster formats', () => {
  assert.match(main, /TURING_WALLPAPER_EXTENSIONS = new Set\(\['\.jpg', '\.jpeg', '\.png', '\.webp', '\.bmp'\]\)/);
  assert.match(main, /showOpenDialog\(\{ properties: \['openDirectory'/);
  assert.match(main, /turing:read-wallpaper/);
  assert.match(main, /TURING_WALLPAPER_MAX_BYTES/);
  assert.match(preload, /readTuringWallpaper/);
  assert.match(preload, /chooseTuringWallpaperDirectory/);
});

test('switching wallpaper resets the RGB565 frame baseline to force a complete refresh', () => {
  assert.match(app, /image\.onload=\(\)=>\{if\(!alive\)return;wallpaperImage\.current=image;setWallpaperLoading\(false\);previousFrame\.current=null/);
  assert.match(app, /const v=\(\(img\.data\[i\]&0xf8\)<<8\)/);
  assert.match(app, /const tw=16,th=8/);
});


test('an older in-flight frame cannot overwrite a newer wallpaper frame baseline', () => {
  assert.match(app, /const frameGeneration = useRef\(0\)/);
  assert.match(app, /generation===frameGeneration\.current\)previousFrame\.current=rgb/);
  assert.match(app, /generation===frameGeneration\.current\)previousFrame\.current=current/);
});


test('wallpaper sender waits for a decoded image and manual send cannot push a blank canvas', () => {
  assert.match(app, /displayMode==='wallpaper'&&\(wallpaperLoading\|\|!wallpaperImage\.current\)\)return/);
  assert.match(app, /请先选择并载入一张有效壁纸/);
});
