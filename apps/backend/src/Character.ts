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
	getDefaultSkills,
	calculateSkillCheck,
	SKILL_ABILITY_MAPPING,
	getClassDefaults,
} from './utils';
import { CharacterState, Condition, Skills, DamageRoll, Action } from './types';

/**
 * Represents a D&D 5e character as a Durable Object
 * Handles character state, combat mechanics, and real-time updates
 */
export class Character extends DurableObject<Env> {
	private connections: Set<WebSocket> = new Set();
	private dmConnection: WebSocket | null = null;
	private playerConnection: WebSocket | null = null;
	private encounterStub: DurableObjectStub<Encounter> | null = null;
	private image: string | null = null;

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
	async initialize(
		name: string,
		backstory: string,
		alignment: CharacterState['alignment'],
		appearance: string,
		race: CharacterState['race'],
		characterClass?: CharacterState['characterClass'],
		stats?: CharacterState['stats'],
		hp?: CharacterState['currentHp'],
		ac?: CharacterState['armor'],
		speed?: CharacterState['speed'],
		skillModifiers?: Partial<Skills>,
		actions?: Action[],
		bonusActions?: Action[],
		playStylePreference?: string
	) {
		const initialStats = stats || (await randomizeStats());
		const initialHp = hp || getHitDice(characterClass) + getModifier(initialStats.constitution);
		const startingArmor = ac || getStartingArmor(characterClass);
		const classDefaults = getClassDefaults(characterClass);

		// Set up skills with proficiencies from class defaults
		const defaultSkills = getDefaultSkills();
		for (const skillName of classDefaults.proficiencies.skills) {
			if (skillName in defaultSkills) {
				defaultSkills[skillName as keyof Skills].proficient = true;
			}
		}
		const skills = {
			...defaultSkills,
			...skillModifiers,
		};

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
			speed: speed || getMovementSpeed(race),
			initiativeModifier: getModifier(initialStats.dexterity),
			armor: startingArmor,
			savingThrows: getClassSavingThrows(characterClass),
			proficiencyBonus: calculateProficiencyBonus(1),
			level: 1,
			skills,
			image: null,
			actions: actions || classDefaults.actions,
			bonusActions: bonusActions || classDefaults.bonusActions,
			playStylePreference: playStylePreference || 'balanced',
		});
	}

	// COMBAT MECHANICS

	/**
	 * Calculates character's Armor Class based on equipment and modifiers
	 * @returns The total AC value
	 */
	async calculateAC(): Promise<number> {
		const armor = (await this.ctx.storage.get('armor')) as CharacterState['armor'];
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];

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
	async rollSavingThrow(
		ability: keyof CharacterState['savingThrows']
	): Promise<{ roll: number; critSuccess: boolean; critFailure?: boolean }> {
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];
		const savingThrows = (await this.ctx.storage.get('savingThrows')) as CharacterState['savingThrows'];
		const proficiencyBonus = (await this.ctx.storage.get('proficiencyBonus')) as CharacterState['proficiencyBonus'];

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

	/**
	 * Performs an attack action
	 * @param actionName Name of the action to perform
	 * @param target Target of the action (if applicable)
	 * @returns Result of the action
	 */
	async performAction(actionName: string, target?: string) {
		const actions = (await this.ctx.storage.get('actions')) as CharacterState['actions'];
		const action = actions.find((a) => a.name === actionName);

		if (!action) throw new Error(`Action ${actionName} not found`);

		if (action.type === 'weapon') {
			const attackRoll = Math.floor(Math.random() * 20) + 1;
			const isCrit = attackRoll === 20;
			const isCritFail = attackRoll === 1;
			const total = attackRoll + action.attackBonus;

			// Calculate damage
			const damage = this.rollDamage(action.damage, isCrit);

			return {
				type: 'attack',
				attackRoll: total,
				damage,
				isCrit,
				isCritFail,
				target,
			};
		}

		if (action.type === 'special') {
			if (action.savingThrow) {
				const dc = action.savingThrow.dc;
				return {
					type: 'special',
					savingThrow: {
						dc,
						ability: action.savingThrow.ability,
					},
					damage: action.damage ? this.rollDamage(action.damage, false) : undefined,
					description: action.description,
					target,
				};
			}

			return {
				type: 'special',
				description: action.description,
				damage: action.damage ? this.rollDamage(action.damage, false) : undefined,
				target,
			};
		}
	}

	/**
	 * Performs a bonus action
	 * @param actionName Name of the bonus action to perform
	 * @param target Target of the action (if applicable)
	 * @returns Result of the bonus action
	 */
	async performBonusAction(actionName: string, target?: string) {
		const bonusActions = (await this.ctx.storage.get('bonusActions')) as CharacterState['bonusActions'];
		const action = bonusActions.find((a) => a.name === actionName);

		if (!action) throw new Error(`Bonus action ${actionName} not found`);

		return this.performAction(actionName, target);
	}

	/**
	 * Rolls damage for an attack
	 * @param damageRoll Damage roll configuration
	 * @param isCrit Whether the attack was a critical hit
	 * @returns Total damage and breakdown
	 */
	private rollDamage(damageRoll: DamageRoll, isCrit: boolean) {
		const diceCount = isCrit ? damageRoll.diceCount * 2 : damageRoll.diceCount;
		let total = damageRoll.modifier;

		const rolls: number[] = [];
		for (let i = 0; i < diceCount; i++) {
			rolls.push(Math.floor(Math.random() * damageRoll.diceType) + 1);
		}

		total += rolls.reduce((sum, roll) => sum + roll, 0);

		return {
			total,
			rolls,
			type: damageRoll.type,
			modifier: damageRoll.modifier,
		};
	}

	/**
	 * Adds an action to the character
	 * @param action Action to add
	 */
	async addAction(action: CharacterState['actions'][number]) {
		const actions = (await this.ctx.storage.get('actions')) as CharacterState['actions'];
		actions.push(action);
		await this.ctx.storage.put('actions', actions);
	}

	/**
	 * Adds a bonus action to the character
	 * @param action Bonus action to add
	 */
	async addBonusAction(action: CharacterState['bonusActions'][number]) {
		const bonusActions = (await this.ctx.storage.get('bonusActions')) as CharacterState['bonusActions'];
		bonusActions.push(action);
		await this.ctx.storage.put('bonusActions', bonusActions);
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
		const conditions = (await this.ctx.storage.get('conditions')) as CharacterState['conditions'];
		conditions.add(condition);
		await this.ctx.storage.put('conditions', conditions);
		await this.broadcastState();
	}

	/**
	 * Removes a condition from the character
	 * @param condition The condition to remove
	 */
	async removeCondition(condition: Condition) {
		const conditions = (await this.ctx.storage.get('conditions')) as CharacterState['conditions'];
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
		const inventory = (await this.ctx.storage.get('inventory')) as CharacterState['inventory'];
		inventory.push(item);
		await this.ctx.storage.put('inventory', inventory);
		await this.broadcastState();
	}

	/**
	 * Removes an item from character's inventory
	 * @param item Item to remove
	 */
	async removeItem(item: string) {
		const inventory = (await this.ctx.storage.get('inventory')) as CharacterState['inventory'];
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
	 * Handles WebSocket setup and message routing
	 * @param socket WebSocket server instance
	 * @param type Connection type
	 */
	private async handleWebSocket(socket: WebSocket, type: 'player' | 'dm' | 'encounter') {
		socket.accept();

		switch (type) {
			case 'player':
				this.playerConnection = socket;
				break;
			case 'dm':
				this.dmConnection = socket;
				break;
			default:
				this.connections.add(socket);
		}

		socket.addEventListener('message', async (event) => {
			try {
				await this.handleMessage(event.data, type);
			} catch (error) {
				console.error('Error handling message:', error);
			}
		});

		socket.addEventListener('close', () => {
			switch (type) {
				case 'player':
					this.playerConnection = null;
					break;
				case 'dm':
					this.dmConnection = null;
					break;
				default:
					this.connections.delete(socket);
			}
		});

		// Send initial state
		await this.broadcastState();
	}

	/**
	 * Broadcasts a message to the encounter
	 * @param message Message to broadcast
	 */
	private async broadcastToEncounter(message: string) {
		if (this.encounterStub) {
			const id = (await this.ctx.storage.get('id')) as string;
			// Send message to encounter through RPC
			await this.encounterStub.fetch('http://fake/broadcast', {
				method: 'POST',
				body: JSON.stringify({
					type: 'character_message',
					characterId: id,
					content: message,
				}),
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

	async setImage(imageKey: string) {
		console.log('Setting image key', imageKey);
		await this.ctx.storage.put('imageKey', imageKey);
	}

	async getImage() {
		const imageKey = (await this.ctx.storage.get('imageKey')) as string | null;
		return imageKey;
	}

	// STATE QUERIES

	/**
	 * Retrieves current character stats
	 * @returns Object containing current stats and conditions
	 */
	async getCharacterState(): Promise<CharacterState> {
		const state = (await this.ctx.storage.list()) as Map<string, unknown>;
		const stateObject = Object.fromEntries(state);
		return stateObject as CharacterState;
	}

	/**
	 * Makes a skill check for a given skill
	 * @param skillName The name of the skill to check
	 * @returns Object containing roll result and critical status
	 */
	async rollSkillCheck(
		skillName: keyof typeof SKILL_ABILITY_MAPPING
	): Promise<{ roll: number; critSuccess: boolean; critFailure: boolean }> {
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];
		const skills = (await this.ctx.storage.get('skills')) as CharacterState['skills'];
		const level = (await this.ctx.storage.get('level')) as number;

		const abilityName = SKILL_ABILITY_MAPPING[skillName];
		const abilityScore = stats[abilityName];
		const skill = skills[skillName];

		const d20Roll = Math.floor(Math.random() * 20) + 1;
		const total = calculateSkillCheck(abilityScore, skill, level);

		return {
			roll: d20Roll + total,
			critSuccess: d20Roll === 20,
			critFailure: d20Roll === 1,
		};
	}
}
