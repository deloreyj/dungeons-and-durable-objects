import { z } from 'zod';
/** Character alignment options in D&D 5e */
export type Alignment =
	| 'Lawful Good'
	| 'Neutral Good'
	| 'Chaotic Good'
	| 'Lawful Neutral'
	| 'True Neutral'
	| 'Chaotic Neutral'
	| 'Lawful Evil'
	| 'Neutral Evil'
	| 'Chaotic Evil';

/** Available character classes in D&D 5e */
export type CharacterClass =
	| 'Barbarian'
	| 'Bard'
	| 'Cleric'
	| 'Druid'
	| 'Fighter'
	| 'Monk'
	| 'Paladin'
	| 'Rogue'
	| 'Sorcerer'
	| 'Warlock'
	| 'Wizard'
	| 'Ranger';

/** Available races in D&D 5e */
export type Race = 'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome' | 'Half-Elf' | 'Half-Orc' | 'Tiefling' | 'Goblin';

/** Possible conditions that can affect a character */
export type Condition =
	| 'Blinded'
	| 'Charmed'
	| 'Deafened'
	| 'Frightened'
	| 'Grappled'
	| 'Incapacitated'
	| 'Invisible'
	| 'Paralyzed'
	| 'Petrified'
	| 'Poisoned'
	| 'Prone'
	| 'Restrained'
	| 'Stunned'
	| 'Unconscious'
	| 'Exhaustion';

/** Types of armor in D&D 5e */
export type ArmorType = 'none' | 'light' | 'medium' | 'heavy';

/** Character ability scores */
export type Stats = {
	strength: number;
	dexterity: number;
	constitution: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
};

/** Armor data structure */
export type ArmorData = {
	type: ArmorType;
	baseAC: number;
	isShieldEquipped: boolean;
	magicBonus: number;
	name: string;
	requiresStrength?: number;
};

/** Saving throw proficiencies */
export type SavingThrows = {
	strength: boolean;
	dexterity: boolean;
	constitution: boolean;
	intelligence: boolean;
	wisdom: boolean;
	charisma: boolean;
};

export type CharacterState = {
	name: string;
	backstory: string;
	alignment: Alignment;
	appearance: string;
	race: Race;
	characterClass: CharacterClass;
	stats: Stats;
	abilities: Array<string>;
	currentHp: number;
	maxHp: number;
	inventory: Array<string>;
	conditions: Set<Condition>;
	speed: number;
	initiativeModifier: number;
	armor: ArmorData;
	savingThrows: SavingThrows;
	proficiencyBonus: number;
	level: number;
	skills: Skills;
	image?: string;
	actions: Action[];
	bonusActions: Action[];
	playStylePreference: string;
};

export const CreateEncounterSchema = z.object({
	name: z.string(),
	arealDescription: z.string(),
	encounterDescription: z.string(),
});

export type SkillModifier = {
	value: number;
	type: 'override' | 'bonus';
	source?: string;
};

export type Skills = {
	[key: string]: {
		proficient: boolean;
		modifier?: SkillModifier;
	};
};

export interface DamageRoll {
	diceCount: number;
	diceType: number;
	modifier: number;
	type:
		| 'slashing'
		| 'piercing'
		| 'bludgeoning'
		| 'fire'
		| 'cold'
		| 'lightning'
		| 'acid'
		| 'thunder'
		| 'force'
		| 'necrotic'
		| 'radiant'
		| 'poison';
}

export interface WeaponAttack {
	type: 'weapon';
	name: string;
	attackBonus: number;
	reach?: number;
	range?: {
		normal: number;
		long: number;
	};
	damage: DamageRoll;
	properties?: string[];
}

export interface SpecialAction {
	type: 'special';
	name: string;
	description: string;
	savingThrow?: {
		ability: keyof CharacterState['stats'];
		dc: number;
	};
	damage?: DamageRoll;
}

export type Action = WeaponAttack | SpecialAction;

export type SimpleFunctionParameter = {
	type: string;
	description?: string;
};

export type SimpleFunction = {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, SimpleFunctionParameter>;
		required: string[];
	};
};

export interface AiTextGenerationToolInput {
	type: 'function';
	function: SimpleFunction;
}
