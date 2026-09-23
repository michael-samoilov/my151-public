#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import http from 'node:http';

const clientId = process.env.GOOGLE_SEARCH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_SEARCH_CLIENT_SECRET?.trim();
const scope = 'https://www.googleapis.com/auth/webmasters.readonly';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_SEARCH_CLIENT_ID and GOOGLE_SEARCH_CLIENT_SECRET in this terminal, then run this command again.');
  process.exit(1);
}

const state = randomBytes(24).toString('hex');
let finish;
const callback = new Promise((resolve) => {
  finish = resolve;
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404).end('Not found');
    return;
  }
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error || !code || returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Authorization was not completed. Return to the terminal for details.');
    finish({ error: error || 'The callback was missing a valid code/state.' });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>Connected</title><p>Google Search Console connected. You can close this tab and return to the terminal.</p>');
  finish({ code });
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    console.error('Could not start the local OAuth callback.');
    process.exitCode = 1;
    server.close();
    return;
  }
  const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('\n2. Approve read-only Search Console access. This terminal will continue automatically.\n');

  const result = await callback;
  server.close();
  if (result.error) {
    console.error(`Google authorization failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: result.code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const payload = await tokenResponse.json();
  if (!tokenResponse.ok || typeof payload.refresh_token !== 'string') {
    console.error('Google did not return a refresh token. Confirm the OAuth client is a Desktop app, then try again.');
    process.exitCode = 1;
    return;
  }

  console.log('\nConnected. Add these three values to the Vercel Production environment:');
  console.log(`GOOGLE_SEARCH_CLIENT_ID=${clientId}`);
  console.log('GOOGLE_SEARCH_CLIENT_SECRET=<the same client secret you used in this terminal>');
  console.log(`GOOGLE_SEARCH_REFRESH_TOKEN=${payload.refresh_token}`);
  console.log('\nOptional only if the Search Console property is not sc-domain:my151.app:');
  console.log('GOOGLE_SEARCH_CONSOLE_SITE_URL=<the exact property URL shown in Search Console>');
});

