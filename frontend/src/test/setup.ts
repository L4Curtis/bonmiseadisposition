import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Démonte les composants montés entre chaque test (isolation).
afterEach(() => cleanup());

// jsdom n'implémente pas ces API DOM utilisées par Radix UI (Select, entre
// autres) : sans ces stubs, ouvrir/fermer un <Select> dans un test lève
// "target.hasPointerCapture is not a function" ou "scrollIntoView is not a
// function". Ajoutés une seule fois, sans écraser une éventuelle
// implémentation existante (jsdom en ajoute certaines selon la version).
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => {};
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
