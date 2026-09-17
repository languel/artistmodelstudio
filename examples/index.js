import watercolorFlowers from './watercolor/flowers.json';
import pixelRose from './pixel/flower_sprite.json';
import flatBauhaus from './flat/geometric.json';

export const EXAMPLES = [
  {
    id: 'watercolor-flowers',
    name: 'Watercolor — Three Leaning Flowers',
    medium: 'watercolor',
    program: watercolorFlowers
  },
  {
    id: 'pixel-rose',
    name: 'Pixel — Rose Sprite (32x48)',
    medium: 'pixel',
    program: pixelRose
  },
  {
    id: 'flat-bauhaus',
    name: 'Flat Canvas — Bauhaus Geometry',
    medium: 'flat',
    program: flatBauhaus
  }
];
