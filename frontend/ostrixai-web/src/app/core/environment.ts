import { webConfig } from './web-config';

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5000',
  ...webConfig,
};
