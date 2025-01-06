# DND Prototype

This is a prototype for a DND app built on Cloudflare's Workers platform. The goal of this prototype is to build a virtual arena for a DND campaign to run on.

The goal of the prototype is to see what happens when we combine stateful cloud primitives (Durable Objects) with AI, hopefully resulting in agentic characters and NPCs.

## Repository Structure

The repository is set up as a `pnpm` workspace with two apps:

- `apps/backend` - This app will contain all of the Durable Objects, websocket server, data storage, etc that make up the backend of the app.
  - At some point we may want to separate the durable objects from the CRUD API that we'll need in order to manage Campaigns, Sessions, and Characters. tbd
- `apps/dungeons-and-durable-objects` - This app will contain a Cloudflare Pages project using Remix, Tailwind CSS, Typescript, and Cloudflare Pages Functions to bind to the services in the backend.

## Setup

Install `pnpm` on your machine

```sh
npm install -g pnpm
```

Install the dependencies

```sh
pnpm install
```

Run the frontend and backend apps. With only two apps, I like to run `pnpm dev` in each app to get a separate terminal for each app.

```sh
cd apps/backend
pnpm dev
```

```sh
cd apps/dungeons-and-durable-objects
pnpm dev
```

## Resources

- [Durable Objects docs](https://developers.cloudflare.com/durable-objects/)
- [Wrangler docs](https://developers.cloudflare.com/workers/wrangler/#_top)
- [Cloudflare Pages docs](https://developers.cloudflare.com/pages/)
- [Remix docs](https://remix.run/docs/en/main)
- [Tailwind CSS docs](https://tailwindcss.com/docs)
- [Typescript docs](https://www.typescriptlang.org/docs/)
