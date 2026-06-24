import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Démonte les composants montés entre chaque test (isolation).
afterEach(() => cleanup());
