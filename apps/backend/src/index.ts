import { Hono } from 'hono';
import { Character } from './Character';
import { Encounter } from './Encounter';
import { zValidator } from '@hono/zod-validator';
import { Ai } from '@cloudflare/workers-types';
import { CharacterSchema, CreateEncounterSchema } from './types';

const app = new Hono<{ Bindings: Env }>();

app.get('/character', async (c) => {
	const characterName = c.req.query('name');
	if (!characterName) {
		return c.text('Character name is required', 400);
	}
	console.log(characterName);

	const id = c.env.CHARACTERS.idFromName(characterName);
	const stub = await c.env.CHARACTERS.get(id);
	stub.initialize("Lil' Tex", 'Chaotic Evil', {}, 'Mock Backstory', {}, 10, 30, 'I look like woody from toy story', 2);
	return c.json(await stub.toJSON());
});

app.get('/characters/:characterName/image', async (c) => {
	const characterName = c.req.param('characterName');
	if (!characterName) {
		return c.text('Character name is required', 400);
	}

	const id = c.env.CHARACTERS.idFromName(characterName);
	const stub = await c.env.CHARACTERS.get(id);
	const image = await stub.getImage();
	return new Response(image, {
		status: 200,
		headers: {
			'Content-Type': 'image/png',
		},
	});
});

app.post('/character', zValidator('json', CharacterSchema), async (c) => {
	const { name, alignment, stats, backStory, abilities, hitPoints, movementSpeed, physicalDescription, proficiencyBonus } =
		c.req.valid('json');

	if (!name) {
		return c.text('Character name is required', 400);
	}

	const id = c.env.CHARACTERS.idFromName(name);
	const stub = await c.env.CHARACTERS.get(id);
	await stub.initialize(name, alignment, stats, backStory, abilities, hitPoints, movementSpeed, physicalDescription, proficiencyBonus);

	return c.text('Character created successfully', 201);
});

app.post('/encounter', zValidator('json', CreateEncounterSchema), async (c) => {
	const { name, arealDescription, encounterDescription } = c.req.valid('json');

	const id = c.env.ENCOUNTERS.idFromName(name);
	const stub = c.env.ENCOUNTERS.get(id);
	await stub.initializeEncounter(name, arealDescription, encounterDescription);

	return c.json({ success: true, encounterID: id.toString() });
});

export default app;

export { Character, Encounter };
