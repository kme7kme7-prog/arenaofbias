import { mountMenu } from './controller.mjs';
const dispose = mountMenu(document.body);
if (import.meta.hot) import.meta.hot.dispose(dispose);
