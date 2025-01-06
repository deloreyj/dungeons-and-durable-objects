import { z } from 'zod';

export const RaceSchema = z.enum([
	'Dragonborn',
	'Dwarf',
	'Elf',
	'Gnome',
	'Half-Elf',
	'Halfling',
	'Half-Orc',
	'Human',
	'Tiefling',
	'Aarakocra',
	'Genasi',
	'Goliath',
	'Aasimar',
	'Firbolg',
	'Kenku',
	'Lizardfolk',
	'Tabaxi',
	'Triton',
	'Bugbear',
	'Goblin',
	'Hobgoblin',
	'Kobold',
	'Orc',
	'Yuan-ti Pureblood',
	'Tortle',
	'Gith',
	'Changeling',
	'Kalashtar',
	'Shifter',
	'Warforged',
	'Centaur',
	'Loxodon',
	'Minotaur',
	'Simic Hybrid',
	'Vedalken',
	'Verdan',
	'Locathah',
	'Grung',
]);

export type Race = z.infer<typeof RaceSchema>;

export const CharacterSchema = z.object({
	name: z.string(),
	alignment: z.string(),
	stats: z.any(), // TODO: Add stats schema
	backStory: z.string(),
	abilities: z.any(), // TODO: Add ability schema
	hitPoints: z.number(),
	movementSpeed: z.number(),
	skills: z.object({}).passthrough().optional(),
	proficiencyBonus: z.number().optional(),
	skillProficiencies: z.any().optional(), // TODO: Add skillProficiencies schema
	physicalDescription: z.string().optional(),
	race: RaceSchema,
});

export type CharacterJSON = z.infer<typeof CharacterSchema>;

export type Ability = {
	name: string;
	description: string;
	usesLeft: number;
	effect: string;
};
export type AbilityIndex = {
	[key: string]: Ability;
};
export enum StatName {
	STR,
	DEX,
	CON,
	INT,
	WIS,
	CHA,
}
type Stat = {
	raw: number;
	bonus: number;
};
export type StatIndex = {
	[key in keyof StatName as string]: Stat;
};
export const SkillNameToStatNameMap = {
	ACROBATICS: StatName.DEX,
	ANIMAL_HANDLING: StatName.WIS,
	ARCANA: StatName.INT,
	ATHLETICS: StatName.STR,
	DECEPTION: StatName.CHA,
	HISTORY: StatName.INT,
	INSIGHT: StatName.WIS,
	INTIMIDATION: StatName.CHA,
	INVESTIGATION: StatName.INT,
	MEDICINE: StatName.WIS,
	NATURE: StatName.INT,
	PERCEPTION: StatName.WIS,
	PERFORMANCE: StatName.CHA,
	PERSUASION: StatName.CHA,
	RELIGION: StatName.INT,
	SLEIGHT_OF_HAND: StatName.DEX,
	STEALTH: StatName.DEX,
	SURVIVAL: StatName.WIS,
} as const;
type Skill = {
	drivingStat: StatName;
	proficient: boolean;
	value: number;
	passiveValue: number;
};
export type SkillIndex = {
	[key in keyof typeof SkillNameToStatNameMap as string]: Skill;
};
export type SkillProficiencySet = keyof StatName;

export const CreateEncounterSchema = z.object({
	name: z.string(),
	arealDescription: z.string(),
	encounterDescription: z.string(),
});
