# @inkdes/email-studio

InkDes Email Studio client for rendering and delivering emails via InkDes.

## Install

```bash
npm install @inkdes/email-studio
```

## Setup

Required headers (sent automatically by the client):
- x-api-key
- x-domain

Optional:
- baseUrl (defaults to `https://render.inkdes.com`)
- defaultLocale (defaults to `en-US`)

## Usage

```ts
import InkDesEmailStudio from '@inkdes/email-studio';

const client = new InkDesEmailStudio({
  apiKey: process.env.INKDES_API_KEY!,
  domain: process.env.INKDES_DOMAIN!,
  // optional
  baseUrl: process.env.INKDES_BASE_URL, // e.g. http://localhost:3001
  defaultLocale: 'en-US',
  timeoutMs: 10000,
});

// Render an email template (no channel_data)
const rendered = await client.render({
  experienceId: 'auth',
  version: 1,
  locale: 'en-US',
  data: { /* your variables */ },
});

if (rendered.ok) {
  console.log(rendered.html, rendered.subject);
}

// Deliver an email (includes channel_data)
const delivered = await client.deliver({
  experienceId: 'auth',
  language: 'en-US',
  channelData: {
    toEmail: 'user@example.com',
    toEmailName: 'User Name',
    fromEmail: 'noreply@inkdes.com',
    fromEmailName: 'InkDes Team',
  },
  data: { /* your variables */ },
});

if (delivered.ok) {
  console.log(delivered.message);
}
```

