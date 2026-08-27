/**
 * APITable <https://github.com/apitable/apitable>
 * Copyright (C) 2022 APITable Ltd. <https://apitable.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Analytics live in their own chunk so deployments without an analytics key —
 * the self-hosted default — never download or evaluate the library. It is
 * loaded (and initialized) only when a key is configured.
 */

import dynamic from 'next/dynamic';
import React from 'react';
import { getEnvVariables } from 'pc/utils/env';

const PostHogClientProvider = dynamic(
  async () => {
    const [{ default: posthog }, { PostHogProvider }] = await Promise.all([import('posthog-js'), import('posthog-js/react')]);
    const Provider = ({ children }: { children: React.ReactNode }) => <PostHogProvider client={posthog}>{children}</PostHogProvider>;
    return Provider;
  },
  { ssr: false },
);

export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => {
  if (!getEnvVariables().NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }
  return <PostHogClientProvider>{children}</PostHogClientProvider>;
};

export const initAnalytics = () => {
  const envVars = getEnvVariables();
  if (!envVars.NEXT_PUBLIC_POSTHOG_KEY) return;
  import('posthog-js').then(({ default: posthog }) => {
    (window as any).posthog = posthog;
    posthog.init(envVars.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: envVars.NEXT_PUBLIC_POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      // Disable in development
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.opt_out_capturing();
      },
    });
  });
};
