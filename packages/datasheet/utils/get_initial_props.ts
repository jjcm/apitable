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

import axios from 'axios';
import { getEnvVars } from 'get_env';
import { NextPageContext } from 'next';
import { FILTER_HEADERS } from './constant';

/**
 * Fetch the boot-critical client info on the server so it can be inlined into
 * the document. The client then renders without waiting for its own round
 * trip. Failures fall back to the client-side request, so a slow or down
 * backend never blocks the document render for long.
 */
const fetchClientInfo = async (context: { ctx: NextPageContext }): Promise<object | null> => {
  const req = context.ctx.req;
  if (!req) return null;
  const host = process.env.API_PROXY || `http://${req.headers.host}`;
  const headers: Record<string, string> = {};
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers['accept-language']) headers['accept-language'] = String(req.headers['accept-language']);
  try {
    const res = await axios.get(`${host}/api/v1/client/info`, { headers, timeout: 1000 });
    return res.data && typeof res.data === 'object' ? res.data : null;
  } catch (e) {
    return null;
  }
};

const LANG_MAP = {
  en_US: 'en-US',
  zh_CN: 'zh-CN',
};

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const filterCustomHeader = (headers?: Record<string, string | string[] | undefined>): Record<string, string> => {
  if (!headers) return {};
  const _headers = {};
  for (const k in headers) {
    if (!FILTER_HEADERS.map((item) => item.toUpperCase()).includes(k.toUpperCase())) {
      continue;
    }
    _headers[k] = headers[k];
  }
  return _headers;
};

export const getInitialProps = async (context: { ctx: NextPageContext }) => {
  const envVars = getEnvVars();
  const cookie = context.ctx.req?.headers.cookie;
  const filterHeaders = filterCustomHeader(context.ctx.req?.headers);
  const clientInfo = await fetchClientInfo(context);

  const baseResponse = {
    env: process.env.ENV,
    version: process.env.WEB_CLIENT_VERSION || 'development',
    envVars: JSON.stringify(envVars),
  };

  const language = context.ctx.req?.headers['accept-language'];
  const headers: Record<string, string> = { ...filterHeaders };

  const defaultLang = envVars.SYSTEM_CONFIGURATION_DEFAULT_LANGUAGE;
  let locale = defaultLang ? LANG_MAP[defaultLang] : 'zh-CN';
  if (cookie) {
    headers.cookie = cookie;
    const getCookie = (name: string) => {
      const value = `; ${cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length >= 2) return parts[1].split(';').shift();
      return null;
    };
    // server lang
    const langParts = getCookie('lang');
    locale = langParts || locale;
  }

  if (language) {
    headers['Accept-Language'] = language;
  }

  return {
    ...baseResponse,
    locale: escapeHtml(locale),
    clientInfo,
  };
};

