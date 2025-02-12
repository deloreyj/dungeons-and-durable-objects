import { Hono } from 'hono';
import { Character } from './Character';
import { Encounter } from './Encounter';
import { GenerateCharacterImageWorkflow } from './GenerateCharacterImageWorkflow';

console.log('Initializing Hono app');
const app = new Hono<{ Bindings: Env }>();

app.get('/character', async (c) => {
	console.log('GET /character - Starting request');
	const characterName = c.req.query('name');
	if (!characterName) {
		console.warn('Character name missing in request');
		return c.text('Character name is required', 400);
	}
	console.log(`Fetching character with name: ${characterName}`);

	const id = c.env.CHARACTERS.idFromName(characterName);
	console.log(`Generated character ID: ${id}`);
	const stub = await c.env.CHARACTERS.get(id);
	const characterState = await stub.getCharacterState();
	console.log('Retrieved character state:', characterState);

	return c.json(characterState);
});

app.get('/characters/:characterId/image', async (c) => {
	console.log('GET /characters/:characterId/image - Starting request');
	const characterId = c.req.param('characterId');
	console.log(`Fetching image for character: ${characterId}`);
	if (!characterId) {
		console.warn('Character ID missing in request');
		return c.text('Character ID is required', 400);
	}

	const id = c.env.CHARACTERS.idFromName(characterId);
	console.log(`Generated character ID: ${id}`);
	const stub = await c.env.CHARACTERS.get(id);
	const imageKey = await stub.getImage();
	console.log('Retrieved image key:', imageKey);
	if (!imageKey) {
		console.warn('No image key found for character');
		return c.notFound();
	}

	const image = await c.env.CHARACTER_IMAGES.get(imageKey);
	if (!image) {
		console.warn('No image found in storage for key:', imageKey);
		return c.notFound();
	}

	const buffer = await image.arrayBuffer();
	if (!buffer) {
		console.warn('Failed to get array buffer from image');
		return c.notFound();
	}

	console.log('Successfully retrieved image, returning response');
	return new Response(buffer, {
		headers: {
			'Content-Type': 'image/jpeg',
		},
	});
});

app.post('/character', async (c) => {
	console.log('POST /character - Starting request');
	const body = await c.req.json();
	console.log('Request body:', body);
	const { name, backstory, alignment, appearance, characterClass, race } = body;

	if (!name) {
		console.warn('Character name missing in request');
		return c.text('Character name is required', 400);
	}

	const characterId = crypto.randomUUID();
	console.log(`Generated new character ID: ${characterId}`);
	const id = c.env.CHARACTERS.idFromName(characterId);
	const stub = c.env.CHARACTERS.get(id);

	console.log('Initializing character with data:', {
		name,
		alignment,
		appearance,
		race,
		characterClass,
	});
	await stub.initialize(name, backstory, alignment, appearance, race, characterClass);

	console.log('Starting image generation workflow');
	await c.env.GENERATE_IMAGE_WORKFLOW.create({
		params: {
			characterId: characterId,
		},
	});

	return c.json({ success: true, characterId: characterId, characterName: name, characterRace: race, characterClass: characterClass });
});

app.post('/encounter', async (c) => {
	console.log('POST /encounter - Starting request');
	const name = 'Goblin Ambush';
	const encounterDescription =
		"You've been on the Triboar Trail for about a half a day. As you come around a bend, you spot two dead horses sprawled about fifty feet ahead of you, blocking the path. Each has several black-feathered arrows sticking out of it. The woods press close to the trail here, with a steep embankment and dense thickets on either side. The saddlebags have been looted. Nearby lies an empty leather map case.";

	const uuid = crypto.randomUUID();
	console.log(`Generated new encounter ID: ${uuid}`);

	const id = c.env.ENCOUNTERS.idFromName(uuid);
	const stub = c.env.ENCOUNTERS.get(id);
	console.log('Initializing encounter');
	await stub.initializeEncounter(uuid, name, encounterDescription);

	console.log('Creating goblins for encounter');
	const goblin1Id = crypto.randomUUID();
	const goblin2Id = crypto.randomUUID();
	const goblin3Id = crypto.randomUUID();
	const goblin4Id = crypto.randomUUID();
	console.log('Generated goblin IDs:', { goblin1Id, goblin2Id, goblin3Id, goblin4Id });

	const goblin1 = c.env.CHARACTERS.idFromName(goblin1Id);
	const goblin2 = c.env.CHARACTERS.idFromName(goblin2Id);
	const goblin3 = c.env.CHARACTERS.idFromName(goblin3Id);
	const goblin4 = c.env.CHARACTERS.idFromName(goblin4Id);

	console.log('Initializing goblin characters');
	const goblin1Stub = c.env.CHARACTERS.get(goblin1);
	const goblin2Stub = c.env.CHARACTERS.get(goblin2);
	const goblin3Stub = c.env.CHARACTERS.get(goblin3);
	const goblin4Stub = c.env.CHARACTERS.get(goblin4);

	console.log('Initializing Snaggletooth');
	await goblin1Stub.initialize(
		'Snaggletooth',
		"Snaggletooth earned his name after losing a tooth in a brawl over a scrap of food. He's the self-proclaimed 'leader' of the group, though it's more due to his loud voice and bullying tactics than actual skill. Snaggletooth dreams of one day leading an army of goblins to pillage and plunder, but for now, he's content stealing from caravans and roughing up adventurers.",
		'Chaotic Evil',
		'A wiry goblin with an exaggerated grin and a broken front tooth',
		'Goblin',
		undefined,
		{ strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
		7,
		{ baseAC: 15, isShieldEquipped: false, magicBonus: 0, name: 'Leather', requiresStrength: 0, type: 'light' },
		30,
		{
			stealth: {
				proficient: true,
				modifier: {
					value: 6,
					type: 'bonus',
					source: 'Goblin',
				},
			},
		},
		[
			{
				type: 'weapon',
				name: 'Scimitar',
				attackBonus: 4,
				reach: 5,
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'slashing',
				},
			},
			{
				type: 'weapon',
				name: 'Shortbow',
				attackBonus: 4,
				range: {
					normal: 80,
					long: 320,
				},
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'piercing',
				},
			},
		],
		[
			{
				type: 'special',
				name: 'Nimble Escape',
				description: 'You can take the Disengage or Hide action as a bonus action on each of your turns.',
			},
		],
		'A good leader is one who sends his troops to the front. Snaggletooth is a good leader. Thats why snaggletooth stays in the back and uses his bow.'
	);

	console.log('Initializing Grizzle');
	await goblin2Stub.initialize(
		'Grizzle',
		"Grizzle is the oldest of the group, a goblin who has survived more scraps than the others combined. Once a shaman's apprentice, he abandoned any spiritual pursuits after realizing the gods weren't doing much to help goblins like him. Bitter and cunning, Grizzle prefers using traps and ambushes to fighting head-on. He hoards shiny trinkets and keeps a pouch full of 'lucky teeth' (some of which are not his own).",
		'Neutral Evil',
		'A grumpy goblin with patchy, grayish-green skin and a raspy voice',
		'Goblin',
		undefined,
		{ strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
		7,
		{ baseAC: 15, isShieldEquipped: false, magicBonus: 0, name: 'Leather', requiresStrength: 0, type: 'light' },
		30,
		{
			stealth: {
				proficient: true,
				modifier: {
					value: 6,
					type: 'bonus',
					source: 'Goblin',
				},
			},
		},
		[
			{
				type: 'weapon',
				name: 'Scimitar',
				attackBonus: 4,
				reach: 5,
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'slashing',
				},
			},
			{
				type: 'weapon',
				name: 'Shortbow',
				attackBonus: 4,
				range: {
					normal: 80,
					long: 320,
				},
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'piercing',
				},
			},
		],
		[
			{
				type: 'special',
				name: 'Nimble Escape',
				description: 'You can take the Disengage or Hide action as a bonus action on each of your turns.',
			},
		],
		'Grizzle wants to see the whites of his enemies teeth in battle. He prefers to ambush his enemies and swing his scimitar.'
	);

	console.log('Initializing Crik');
	await goblin3Stub.initialize(
		'Crik',
		"Crik's jittery nature comes from years spent dodging predators and bigger goblins. His nervous energy hides a surprisingly sharp mind for mischief. Crik loves pulling pranks and creating distractions—sometimes at the worst possible moment for his own allies. He secretly hopes to escape goblin life and explore the world, but he's too scared to leave the group on his own.",
		'Chaotic Neutral',
		'A jittery, high-energy goblin who constantly clicks his nails together',
		'Goblin',
		undefined,
		{ strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
		7,
		{ baseAC: 15, isShieldEquipped: false, magicBonus: 0, name: 'Leather', requiresStrength: 0, type: 'light' },
		30,
		{
			stealth: {
				proficient: true,
				modifier: {
					value: 6,
					type: 'bonus',
					source: 'Goblin',
				},
			},
		},
		[
			{
				type: 'weapon',
				name: 'Scimitar',
				attackBonus: 4,
				reach: 5,
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'slashing',
				},
			},
			{
				type: 'weapon',
				name: 'Shortbow',
				attackBonus: 4,
				range: {
					normal: 80,
					long: 320,
				},
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'piercing',
				},
			},
		],
		[
			{
				type: 'special',
				name: 'Nimble Escape',
				description: 'You can take the Disengage or Hide action as a bonus action on each of your turns.',
			},
		],
		'Crik prefers to use his stealth to hide and use his bow to attack from a distance.'
	);

	console.log('Initializing Bogrot');
	await goblin4Stub.initialize(
		'Bogrot',
		"Born in a damp cave near a stagnant swamp, Bogrot carries the stench of his homeland with pride. Known for his brute strength and appetite for anything remotely edible, Bogrot is the muscle of the group. He doesn't care much for plans or strategy; his solution to most problems is to smash them until they stop being problems. Despite his foul demeanor, he has a soft spot for swamp creatures and once kept a pet toad named Squelch (who sadly became someone's dinner).",
		'Neutral Evil',
		'A stout goblin who smells faintly of swamp muck and speaks in gruff tones',
		'Goblin',
		undefined,
		{ strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
		7,
		{ baseAC: 15, isShieldEquipped: false, magicBonus: 0, name: 'Leather', requiresStrength: 0, type: 'light' },
		30,
		{
			stealth: {
				proficient: true,
				modifier: {
					value: 6,
					type: 'bonus',
					source: 'Goblin',
				},
			},
		},
		[
			{
				type: 'weapon',
				name: 'Scimitar',
				attackBonus: 4,
				reach: 5,
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'slashing',
				},
			},
			{
				type: 'weapon',
				name: 'Shortbow',
				attackBonus: 4,
				range: {
					normal: 80,
					long: 320,
				},
				damage: {
					diceCount: 1,
					diceType: 6,
					modifier: 2,
					type: 'piercing',
				},
			},
		],
		[
			{
				type: 'special',
				name: 'Nimble Escape',
				description: 'You can take the Disengage or Hide action as a bonus action on each of your turns.',
			},
		],
		'Bogrot prefers to use his brute strength to smash things. Hack and slash is the best way to deal with enemies.'
	);

	console.log('Registering goblins with encounter');
	await stub.registerCharacter(goblin1Id, 'Enemies');
	await stub.registerCharacter(goblin2Id, 'Enemies');
	await stub.registerCharacter(goblin3Id, 'Enemies');
	await stub.registerCharacter(goblin4Id, 'Enemies');

	console.log('Starting image generation workflows for goblins');
	await c.env.GENERATE_IMAGE_WORKFLOW.create({
		params: {
			characterId: goblin1Id,
		},
	});

	await c.env.GENERATE_IMAGE_WORKFLOW.create({
		params: {
			characterId: goblin2Id,
		},
	});

	await c.env.GENERATE_IMAGE_WORKFLOW.create({
		params: {
			characterId: goblin3Id,
		},
	});

	await c.env.GENERATE_IMAGE_WORKFLOW.create({
		params: {
			characterId: goblin4Id,
		},
	});

	// Update the create-character form to include all the new fields I've added to the character
	// Return the character ID to the user after creation so they can use it to join the encounter
	// When creating an encounter, return the encounter ID and instruct the user to share it with people they want to join
	// Create a `join encounter` form that allows users to join either as a player or as the dungeon master
	// If joining as the dungeon master, enter the encounter ID and then join the encounter
	// Create a dm view of the encounter that shows current encounter state and gives the DM the ability to start the encounter and update encounter state
	// Create a player view of the encounter that shows the character sheet and the current state of the encounter

	console.log('Encounter creation completed successfully');
	return c.json({ success: true, encounterID: uuid, encounterName: name });
});

app.post('/encounter/:encounterId/characters/:characterId', async (c) => {
	console.log('POST /encounter/:encounterId/characters/:characterId - Starting request');
	const { encounterId, characterId } = c.req.param();
	console.log('Params:', { encounterId, characterId });

	const encounterDoId = c.env.ENCOUNTERS.idFromName(encounterId);

	const encounterStub = c.env.ENCOUNTERS.get(encounterDoId);

	console.log('Registering character with encounter');
	await encounterStub.registerCharacter(characterId, 'Party');

	return c.json({ success: true });
});

app.get('/encounter/:encounterId', async (c) => {
	console.log('GET /encounter/:encounterId - Starting request');
	const encounterId = c.req.param('encounterId');
	if (!encounterId) {
		console.warn('Encounter ID missing in request');
		return c.text('Encounter ID is required', 400);
	}
	console.log(`Fetching encounter with ID: ${encounterId}`);

	const id = c.env.ENCOUNTERS.idFromName(encounterId);
	const stub = c.env.ENCOUNTERS.get(id);
	const encounterState = await stub.getEncounterState();
	console.log('Retrieved encounter state:', encounterState);

	const state = {
		...encounterState,
		characters: Object.values(encounterState.characters || {}),
		characterPositions: encounterState.characterPositions || {},
	};
	console.log('Processed state:', state);

	return c.json(state);
});

app.get('/encounter/:encounterId/ws', async (c) => {
	console.log('GET /encounter/:encounterId/ws - Starting request');
	const upgradeHeader = c.req.header('Upgrade');
	console.log('Upgrade header:', upgradeHeader);
	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		console.warn('Upgrade header missing or not websocket');
		return new Response('Durable Object expected Upgrade: websocket', { status: 426 });
	}
	console.log('Upgrade header is websocket');

	const encounterId = c.req.param('encounterId');
	if (!encounterId) {
		console.warn('Encounter ID missing in request');
		return c.text('Encounter ID is required', 400);
	}
	console.log('Encounter ID:', encounterId);

	const id = c.env.ENCOUNTERS.idFromName(encounterId);
	const stub = c.env.ENCOUNTERS.get(id);
	console.log('Retrieved encounter stub');
	return stub.fetch(c.req.raw);
});

app.post('/encounter/:encounterId/start', async (c) => {
	console.log('POST /encounter/:encounterId/start - Starting request');
	const encounterId = c.req.param('encounterId');
	if (!encounterId) {
		console.warn('Encounter ID missing in request');
		return c.text('Encounter ID is required', 400);
	}
	console.log(`Starting encounter with ID: ${encounterId}`);

	const id = c.env.ENCOUNTERS.idFromName(encounterId);
	const stub = c.env.ENCOUNTERS.get(id);
	await stub.startEncounter();

	return c.json({ success: true });
});

app.post('/encounter/:encounterId/end', async (c) => {
	console.log('POST /encounter/:encounterId/end - Starting request');
	const encounterId = c.req.param('encounterId');
	if (!encounterId) {
		console.warn('Encounter ID missing in request');
		return c.text('Encounter ID is required', 400);
	}
	console.log(`Ending encounter with ID: ${encounterId}`);

	const id = c.env.ENCOUNTERS.idFromName(encounterId);
	const stub = c.env.ENCOUNTERS.get(id);
	await stub.endEncounter();

	return c.json({ success: true });
});

export default app;

export { Character, Encounter, GenerateCharacterImageWorkflow };
