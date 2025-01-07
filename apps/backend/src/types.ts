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
export type Race = 'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome' | 'Half-Elf' | 'Half-Orc' | 'Tiefling';

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

export const CreateEncounterSchema = z.object({
	name: z.string(),
	arealDescription: z.string(),
	encounterDescription: z.string(),
});
