import { parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { shareSvg } from './share-card.js';

const font = {
  fontFiles: [
    fileURLToPath(new URL('./fonts/NotoSansSC.ttf', import.meta.url)),
  ],
  loadSystemFonts: false,
  defaultFontFamily: 'Noto Sans SC',
};
parentPort.on('message', ({ data, url, landscape }) => {
  try {
    parentPort.postMessage({
      png: new Resvg(shareSvg(data, url, landscape), { font }).render().asPng(),
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
