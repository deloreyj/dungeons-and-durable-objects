import { DurableObject } from 'cloudflare:workers';
import { Encounter } from './Encounter';
import {
	calculateProficiencyBonus,
	getClassSavingThrows,
	getHitDice,
	getModifier,
	getMovementSpeed,
	getStartingArmor,
	randomizeStats,
} from './utils';
import { Alignment, ArmorData, CharacterClass, Condition, Race, SavingThrows, Stats } from './types';

/**
 * Represents a D&D 5e character as a Durable Object
 * Handles character state, combat mechanics, and real-time updates
 */
export class Character extends DurableObject<Env> {
	private connections: Set<WebSocket> = new Set();
	private dmConnection: WebSocket | null = null;
	private playerConnection: WebSocket | null = null;
	private encounterStub: DurableObjectStub<Encounter> | null = null;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}

	/**
	 * Initializes a new character with basic attributes and starting equipment
	 * @param name Character name
	 * @param backstory Character background story
	 * @param alignment Character's moral and ethical alignment
	 * @param appearance Physical description
	 * @param characterClass D&D class
	 * @param race Character race
	 */
	async initialize(name: string, backstory: string, alignment: Alignment, appearance: string, characterClass: CharacterClass, race: Race) {
		const hitDie = getHitDice(characterClass);
		const initialStats = await randomizeStats();
		const initialHp = hitDie + getModifier(initialStats.constitution);

		const startingArmor = getStartingArmor(characterClass);
		const savingThrows = getClassSavingThrows(characterClass);
		const level = 1;

		await this.ctx.storage.put({
			name,
			backstory,
			alignment,
			appearance,
			race,
			characterClass,
			stats: initialStats,
			abilities: [],
			currentHp: initialHp,
			maxHp: initialHp,
			inventory: [],
			conditions: new Set(),
			speed: getMovementSpeed(race),
			initiativeModifier: getModifier(initialStats.dexterity),
			armor: startingArmor,
			savingThrows,
			proficiencyBonus: calculateProficiencyBonus(level),
			level,
		});
	}

	// COMBAT MECHANICS

	/**
	 * Calculates character's Armor Class based on equipment and modifiers
	 * @returns The total AC value
	 */
	async calculateAC(): Promise<number> {
		const armor = (await this.ctx.storage.get('armor')) as ArmorData;
		const stats = (await this.ctx.storage.get('stats')) as Stats;

		const dexMod = getModifier(stats.dexterity);

		let ac = armor.baseAC;
		switch (armor.type) {
			case 'none':
				ac += dexMod;
				break;
			case 'light':
				ac += dexMod;
				break;
			case 'medium':
				ac += Math.min(dexMod, 2);
				break;
			// heavy armor uses base AC only
		}

		if (armor.isShieldEquipped) ac += 2;
		ac += armor.magicBonus;

		return ac;
	}

	/**
	 * Performs a saving throw for a given ability
	 * @param ability The ability to make the saving throw with
	 * @returns Object containing roll result and critical status
	 */
	async rollSavingThrow(ability: keyof SavingThrows): Promise<{ roll: number; critSuccess: boolean; critFailure?: boolean }> {
		const stats = (await this.ctx.storage.get('stats')) as Stats;
		const savingThrows = (await this.ctx.storage.get('savingThrows')) as SavingThrows;
		const proficiencyBonus = (await this.ctx.storage.get('proficiencyBonus')) as number;

		const roll = Math.floor(Math.random() * 20) + 1;
		const modifier = getModifier(stats[ability]);
		const bonus = savingThrows[ability] ? proficiencyBonus : 0;
		const total = roll + modifier + bonus;

		return {
			roll: total,
			critSuccess: roll === 20,
			critFailure: roll === 1,
		};
	}

	/**
	 * Rolls initiative for combat
	 * @returns The initiative roll total
	 */
	async rollInitiative(): Promise<number> {
		const initiativeModifier = (await this.ctx.storage.get('initiativeModifier')) as number;
		const roll = Math.floor(Math.random() * 20) + 1;
		const initiativeRoll = roll + initiativeModifier;
		await this.ctx.storage.put('initiativeRoll', initiativeRoll);
		return initiativeRoll;
	}

	// HEALTH AND CONDITIONS

	/**
	 * Updates character's hit points and handles unconsciousness
	 * @param amount Amount to change HP (positive for healing, negative for damage)
	 */
	async updateHp(amount: number) {
		const currentHp = (await this.ctx.storage.get('currentHp')) as number;
		const maxHp = (await this.ctx.storage.get('maxHp')) as number;

		const newHp = Math.max(0, Math.min(maxHp, currentHp + amount));
		await this.ctx.storage.put('currentHp', newHp);

		if (newHp === 0) {
			await this.addCondition('Unconscious');
		}

		await this.broadcastState();
	}

	/**
	 * Applies damage to the character
	 * @param amount Amount of damage taken
	 */
	async takeDamage(amount: number) {
		await this.updateHp(-amount);
		const response = await this.generateResponse(`I took ${amount} damage!`);
		await this.broadcastToEncounter(response);
	}

	/**
	 * Heals the character
	 * @param amount Amount of healing received
	 */
	async heal(amount: number) {
		await this.updateHp(amount);
		const response = await this.generateResponse(`I was healed for ${amount} HP!`);
		await this.broadcastToEncounter(response);
	}

	/**
	 * Adds a condition to the character
	 * @param condition The condition to apply
	 */
	async addCondition(condition: Condition) {
		const conditions = (await this.ctx.storage.get('conditions')) as Set<Condition>;
		conditions.add(condition);
		await this.ctx.storage.put('conditions', conditions);
		await this.broadcastState();
	}

	/**
	 * Removes a condition from the character
	 * @param condition The condition to remove
	 */
	async removeCondition(condition: Condition) {
		const conditions = (await this.ctx.storage.get('conditions')) as Set<Condition>;
		conditions.delete(condition);
		await this.ctx.storage.put('conditions', conditions);
		await this.broadcastState();
	}

	// EQUIPMENT AND INVENTORY

	/**
	 * Adds an item to character's inventory
	 * @param item Item to add
	 */
	async addItem(item: string) {
		const inventory = (await this.ctx.storage.get('inventory')) as string[];
		inventory.push(item);
		await this.ctx.storage.put('inventory', inventory);
		await this.broadcastState();
	}

	/**
	 * Removes an item from character's inventory
	 * @param item Item to remove
	 */
	async removeItem(item: string) {
		const inventory = (await this.ctx.storage.get('inventory')) as string[];
		const index = inventory.indexOf(item);
		if (index > -1) {
			inventory.splice(index, 1);
			await this.ctx.storage.put('inventory', inventory);
			await this.broadcastState();
		}
	}

	// COMMUNICATION AND STATE MANAGEMENT

	/**
	 * Establishes WebSocket connection for real-time updates
	 * @param type Connection type (player, DM, or encounter)
	 * @returns Client WebSocket
	 */
	async connect(type: 'player' | 'dm' | 'encounter'): Promise<WebSocket> {
		const { 0: client, 1: server } = new WebSocketPair();
		await this.handleWebSocket(server, type);
		return client;
	}

	/**
	 * Handles incoming WebSocket messages
	 * @param data Message data
	 * @param source Message source type
	 */
	private async handleMessage(data: string | ArrayBuffer, source: 'player' | 'dm' | 'encounter') {
		const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));

		switch (message.type) {
			case 'chat':
				if (source === 'player') {
					const response = await this.generateResponse(message.content);
					await this.sendToPlayer(response);
				}
				break;

			case 'damage':
				await this.updateHp(-message.amount);
				const response = await this.generateResponse(`I took ${message.amount} damage!`);
				await this.broadcastToEncounter(response);
				break;

			// Add other message type handlers as needed
		}
	}

	/**
	 * Broadcasts state updates to all connected clients
	 */
	private async broadcastState() {
		const state = {
			type: 'state_update',
			data: await this.ctx.storage.list(),
		};

		for (const conn of this.connections) {
			conn.send(JSON.stringify(state));
		}
		if (this.playerConnection) this.playerConnection.send(JSON.stringify(state));
		if (this.dmConnection) this.dmConnection.send(JSON.stringify(state));
	}

	/**
	 * Sends a message to the player's connection
	 * @param message Message to send
	 */
	private async sendToPlayer(message: string) {
		if (this.playerConnection) {
			this.playerConnection.send(
				JSON.stringify({
					type: 'message',
					content: message,
				})
			);
		}
	}

	/**
	 * Broadcasts a message to the encounter
	 * @param message Message to broadcast
	 */
	private async broadcastToEncounter(message: string) {
		if (this.encounterStub) {
			const id = (await this.ctx.storage.get('id')) as string;
			await this.encounterStub.broadcast({
				type: 'character_message',
				characterId: id,
				content: message,
			});
		}
	}

	// AI INTEGRATION

	/**
	 * Generates AI response based on character personality
	 * @param context Situation context
	 * @returns Generated response
	 */
	async generateResponse(context: string): Promise<string> {
		const systemPrompt = (await this.ctx.storage.get('systemPrompt')) as string;
		const prompt = `${systemPrompt}\n\nContext: ${context}\n\nResponse:`;
		return 'Generated response based on character personality';
	}

	async getImage(): Promise<AiTextToImageOutput> {
		const alignment = (await this.ctx.storage.get('alignment')) as Alignment;
		const physicalDescription = (await this.ctx.storage.get('physicalDescription')) as string;
		const name = (await this.ctx.storage.get('name')) as string;

		const inputs = {
			prompt: `Dungeons and Dragons character named ${name} 
			Physical description: ${physicalDescription} 
			Alignment: ${alignment}`,
		};

		const response = await this.env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', inputs);

		return response;
	}

	// STATE QUERIES

	/**
	 * Retrieves current character stats
	 * @returns Object containing current stats and conditions
	 */
	async getStats() {
		const [stats, currentHp, maxHp, conditions] = await Promise.all([
			this.ctx.storage.get('stats'),
			this.ctx.storage.get('currentHp'),
			this.ctx.storage.get('maxHp'),
			this.ctx.storage.get('conditions'),
		]);

		return {
			stats,
			currentHp,
			maxHp,
			conditions: Array.from(conditions as Set<Condition>),
		};
	}
}
