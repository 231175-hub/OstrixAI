import { webConfig } from './web-config';

export const environment = {
  production: true,
  apiBaseUrl: 'https://ostrixai-production.up.railway.app',
  ...webConfig,
};
