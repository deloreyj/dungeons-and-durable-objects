# Dungeons and Durable Objects PRD

## 1. Encounter Durable Object

### Overview

Acts as the central controller for a D&D combat scenario, maintaining and distributing all relevant state to characters and clients. It coordinates turn order, combat actions, and shared logs (like the encounter chat), while also managing real-time connections.

### Requirements

#### 1. Round & Turn Tracking

- **Round Count**: Maintain an integer (`roundNumber`) to track the total number of rounds elapsed in the encounter. Increment after every full cycle of initiative.
- **Initiative Order**: Store a sorted list of character IDs or references (`initiativeOrder`) for turn-taking.
- **Current Turn**: Keep an index or pointer (`currentTurnIndex`) pointing to which character currently acts.

#### 2. State Management

- **Map & Locations**: Track a grid or coordinate system (`mapState`) to store each character’s or NPC’s position.
- **Teams**: Group characters and NPCs under labels like “Party” or “Enemies” for easier AI and decision-making logic.
- **Encounter Summary Log**: Maintain a chronological list of events/actions (`encounterLog`). Each action, move, or effect is appended here.

#### 3. WebSocket Connections

- **Partykit Integration**: The Encounter DO should create and manage connections from players and from each Character DO, ensuring real-time updates.
- **Broadcast Mechanism**: Provide a means to send updated state or chat messages to all connected clients.

#### 4. Communication with Character DOs

- **Stats & Abilities**: When needed, request a character’s stats, abilities, or HP info from the Character DO.
- **Action Coordination**: For attacks or ability usage, the Encounter DO requests the relevant Character DO to confirm or apply the effect, then updates the other affected character(s).

#### 5. Coordinating Actions & Effects

- **Action Resolution**: If a character decides to attack or use a spell, the Encounter DO orchestrates dice rolls, damage calculation (if you adopt those minimal dice mechanics), and triggers HP updates on the target’s Character DO.
- **Affecting Multiple Characters**: For area-of-effect abilities or spells, the Encounter DO sends effect notifications to each affected character in sequence.

#### 6. Running Chat Log

- **Encounter Chat**: Append every movement, attack, ability usage, or result to a universal chat feed.
- **Character Reactions**: Whenever a character is attacked or affected, the Encounter DO can invoke that character’s AI (via the Character DO) to generate a flavor response.

#### 7. Ending the Encounter

- **Trigger Workflow**: On conclusion, invoke a Cloudflare Workflow to:
  1. Generate a summary of the encounter.
  2. Generate highlight/lowlights/funny moments.
  3. Generate Midjourney-style prompts for images, referencing appearance data from characters and NPCs.
  4. Add each image to the encounter’s gallery.

---

## 2. Character Durable Object

### Overview

Serves as a digital “character sheet” and AI persona. It stores a character’s stats, inventory, role-playing traits, and offers a place for AI interactions (LLM prompts). Each Character DO can communicate privately with its player and with the Encounter DO.

### Requirements

#### 1. Core Character Data

- **Profile**: Name, backstory, alignment, appearance.
- **Stats & Abilities**: Ability scores (e.g., STR, DEX, etc.), any class features, spells, or unique abilities.
- **Hit Points**: Current HP and (optionally) maximum HP.

#### 2. Inventory

- **Items & Equipment**: Minimal tracking of what the character is carrying. Could be a list (e.g., `[ "sword", "shield", "health potion" ]`).

#### 3. WebSocket Connection

- Each Character DO manages a direct WebSocket to its player’s client.
- Receives private messages from the Encounter DO or from the player’s browser.

#### 4. LLM Integration

- **System Prompt**: A stored string to set the “tone” or “personality” for the character’s AI generation.
- **AI Conversation**: A method (e.g., `generateResponse(context)`) that uses the system prompt + current conversation context to create in-character dialogue or decisions.

#### 5. Methods for Communication

- **Incoming DM & Encounter Prompts**: Should accept and parse messages from the DM or Encounter DO about a situation (“You got hit for 5 damage. Please respond.”).
- **Outgoing Chat**: On receiving a trigger (like an `@` mention in party chat), it can send an AI-generated response to the Encounter DO to be broadcast publicly.

---

## 3. The Game Loop

### Overview

Defines how a combat scenario is launched and proceeds through each character’s turn. It ensures everyone in the encounter gets a chance to speak and act in order.

### Requirements

#### 1. Encounter Initialization

- **Set Up Encounter**: The Encounter DO is initialized with map size, participants, and environment details.
- **Register Characters**: The Encounter DO registers each Character DO, seeding the chat with a high-level summary.

#### 2. Broadcast & Dialogue

- **Initial Greetings**: At the start of each round (or when the game loop begins), prompt each character to say or do something. Collect and broadcast these statements.
- **Chat Logging**: Every statement, from either a human or AI, is appended to the encounter log.

#### 3. Active Character’s Turn

- **Prompt**: The Encounter DO sends a context prompt to the active character: current map, chat history, possible actions, etc.
- **Action Handling**: Once the character decides on an action, the Encounter DO resolves it (e.g., rolling dice, applying damage).
- **Move to Next**: After the action is resolved, increment the turn index and prompt the next character.

---

## 4. The Turn (D&D Core Actions)

### Overview

On a given turn, a character can perform standard D&D actions: **Action**, **Movement**, and **Bonus Action** (if available).

### Requirements

#### 1. Action

- **Allowed Types**: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object (or any subset relevant to the scenario).
- **Handling**: The Encounter DO checks if the character is able to perform the chosen action (e.g., not unconscious), then processes it.

#### 2. Movement

- **Speed**: Characters may move a distance up to their speed in squares. Movement can be split before/after an Action.
- **Check**: If implementing Basic Movement Validation, the Encounter DO confirms the distance is not exceeded.

#### 3. Bonus Action

- **Availability**: Some characters have bonus actions due to class features or spells. If they do, the Encounter DO allows them a second action slot. Otherwise, none.

#### 4. Free Object Interaction

- **Examples**: Drawing a weapon, opening an unlocked door. Tracked minimally in the log so that other players and the DM know what happened.

---

## 5. Encounter Chat

### Overview

A unified channel where all players, NPCs, and characters can see major updates, such as damage results, movement, or dialogue intended for the entire group.

### Requirements

#### 1. Public Broadcast

- **WebSocket Delivery**: The Encounter DO broadcasts messages to all connected player clients and Character DOs.
- **Log Updates**: Each new message or event is appended to `encounterLog`.

#### 2. Interaction Hooks

- **@ Mentions**: Characters can be invoked via an `@` mention, prompting them to respond.
- **AI Responses**: The Encounter DO may occasionally trigger a random or event-based response from a Character DO to simulate lively table banter.

---

## 6. DM Chat

### Overview

A private channel between the Dungeon Master (DM) and a single Character DO. The DM can issue secret instructions or clarifications without revealing them to the rest of the party.

### Requirements

#### 1. Private WebSocket

- The Character DO maintains a direct connection to the DM (or a separate DM client) for hidden communication.

#### 2. Secrecy

- **Non-Broadcast**: Messages in DM chat do not appear in the encounter chat or party chat.
- **Coordination**: The DM can convey confidential plot details or ask a character to roll a secret saving throw, etc.

---

## 7. Character Chat

### Overview

Allows a player to privately converse with their own character’s AI persona. Think of it as the “player’s ear” to the character, for strategizing or flavor role-play.

### Requirements

#### 1. Private Chat Session

- **Player ↔ Character DO**: The Character DO hosts a WebSocket session accessible only to the player who controls that character.
- **No Eavesdropping**: Messages here are not shared with other players or the DM.

#### 2. LLM Integration

- **Strategy & Dialogue**: The player might ask the character for suggestions or discuss plans. The AI responds using the system prompt + context.
- **Optional**: The Encounter DO could limit usage or prompt the Character DO only at certain times (e.g., once per turn) to keep game flow moving.

---

## 8. Party Chat

### Overview

A channel strictly for the adventuring party (and possibly friendly NPCs on the same team) to strategize without the enemies hearing.

### Requirements

#### 1. Group Broadcast

- **Encounter DO** sends party messages only to the relevant Character DOs and human party members.
- **Party Chat Log**: Maintains a separate feed or flags messages in the encounter log as “Party Only.”

#### 2. Character AI Participation

- **@ Mentions**: Let players directly call on a particular character to react or advise.
- **Random Inputs**: After each message, there’s a small chance the Encounter DO prompts a Character DO to add a witty or strategic comment.

---

## 9. Ending an Encounter

### Overview

Wraps up the combat and logs the aftermath. Optionally triggers creative or narrative expansions like generating a summary, highlights, and AI-generated images.

### Requirements

#### 1. Trigger Workflow

- **Cloudflare Workflow**: On “encounter end,” call a workflow to process an epilogue.
- **Encounter Summary**: Outline key events, who was injured, who delivered the final blow, etc.

#### 2. Highlights & Lowlights

- Collect the “top 5-10 best or worst moments,” possibly from the `encounterLog`.

#### 3. Midjourney-Style Prompts

- **Parallel Generation**: For each highlight, generate a short textual description that includes:
  - Character names and appearances
  - Enemies or environment details
- **Gallery**: Store or embed resulting images in the Encounter DO.

---

## 10. Dice Rolling Mechanic

### Overview

A simple system to enable dice rolls in a D&D-like environment for actions such as attacks, saving throws, and skill checks.

### Requirements

- **Dice Rolling Endpoint**
  - The Encounter Durable Object provides a method (e.g., `rollDice(diceSpec)`) that returns a random integer result.
  - `diceSpec` can be something like `"1d20 + 5"` or `"2d6"`.
- **Randomness Source**
  - Must use a reliable, fair random number generator (e.g., `crypto.getRandomValues` in Workers).
- **Usage in Encounters**
  - Characters or the encounter logic can call this method for any roll needed (attack rolls, initiative, checks, etc.).
  - The result is broadcast to relevant participants (e.g., the player, the DM, or everyone in the encounter chat, if needed).
- **Modifiers (Minimal)**
  - The system should handle a basic modifier (e.g., `+X`) in addition to the dice roll result.
  - Example usage: `rollDice("1d20+3")` returns an integer representing the d20 roll plus 3.

---

## 11. Damage and Combat Resolution

### Overview

A lightweight mechanism to calculate damage from attacks or spells and apply it to a target’s HP.

### Requirements

- **Damage Calculation**
  - Add a method (e.g., `calculateDamage(attackData)`) in the Encounter Durable Object to handle basic formulae (e.g., `diceRoll + abilityModifier`).
  - Dice rolling is handled by the previously described dice mechanic.
- **Applying Damage**
  - When an attack or ability is used, the Encounter DO coordinates:
    1. Rolling to hit (if applicable).
    2. Rolling for damage (if the hit is successful).
    3. Subtracting that damage from the target’s current HP in the Character Durable Object.
- **HP Update & Log**
  - The Encounter Durable Object sends a message to the relevant Character Durable Object to update HP.
  - Any changes in HP (and potential knockouts) are appended to the encounter chat log (and optionally DM or party chat, depending on privacy settings).
- **Edge Cases**
  - **Minimum 0 HP**: If the resulting HP is below 0, set HP to 0.
  - **Knockout**: If HP hits 0, mark the character as unconscious (or “downed”).

---

## 12. Simple Condition / Status Tracking

### Overview

Allow tracking of a minimal set of conditions that affect a character’s ability to act in combat.

### Requirements

- **Condition List (Minimal)**
  - **Unconscious**: The character cannot take any actions or moves, typically assigned when HP ≤ 0.
  - _(Optional)_ Stunned, Grappled, or any other single condition if needed for your scenario, but keep it minimal.
- **Storage**
  - A Character Durable Object has a small data field (e.g., `conditions: Set<string>`) to store active statuses.
- **Condition Effects**
  - The Encounter Durable Object checks for conditions before prompting a character for an action.
  - If a character is unconscious, the Encounter DO skips their turn or triggers a “death save” scenario if you want to keep it extremely minimal, just skip.
- **Updating Conditions**
  - The Encounter DO is responsible for adding/removing conditions (e.g., removing unconscious if a heal occurs).
  - Any changes in conditions are appended to the encounter chat log.

---

## 13. Basic Movement Validation

### Overview

Ensure characters only move within their allowed distance on the map.

### Requirements

- **Speed & Grid**
  - Each character has a `speed` stat stored in the Character Durable Object (e.g., 30 ft).
  - The map uses 5-ft squares (typical D&D). So 30 ft = 6 squares.
- **Movement Action**
  - The Encounter Durable Object includes a method (e.g., `moveCharacter(characterId, newX, newY)`) that checks:
    - The distance from old position to new position.
    - The character has enough speed remaining this turn.
  - If valid, updates the character’s position in the encounter state. Otherwise, returns an error or partial move.
- **Obstacles (Optional)**
  - To keep scope minimal, you can ignore or just vaguely handle obstacles (like walls).
  - If you do want a basic approach, the system can store impassable squares. The move is validated only if it doesn’t cross those squares.
- **Broadcast Updates**
  - After a successful move, the new position is sent to all participants via the encounter chat (or state update).

---

## 14. Initiative Rolling / Ordering

### Overview

Determines the order in which characters take turns by rolling initiative at the start of an encounter.

### Requirements

- **Initiative Roll**
  - When an encounter begins, each participating character calls the dice rolling method (`rollDice("1d20 + initiativeModifier")`).
  - The result is stored in a temporary field in the Character Durable Object (e.g., `initiativeRoll`).
- **Sort Order**
  - The Encounter Durable Object sorts participants in descending order of initiative results.
  - The sorted list is stored in an encounter state field (e.g., `initiativeOrder: string[]`).
- **Ties (Optional)**
  - If two characters roll the same, either reorder them arbitrarily or add a quick tiebreaker (like comparing DEX or a second roll).
- **Turn Progression**
  - The Encounter DO keeps a pointer (e.g., `currentTurnIndex`) to track whose turn it is in the initiative array.
  - After a turn ends, increment the pointer and cycle back to the start if at the end of the list.
- **Resets**
  - If initiative needs to be rerolled (e.g., a new wave of enemies enters), the Encounter DO can repeat the process as needed.
