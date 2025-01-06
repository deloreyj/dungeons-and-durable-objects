# Task List for LLM Implementation

Below is a breakdown of the **Dungeons and Durable Objects PRD** into individual tasks that an LLM (Large Language Model) could tackle. Each task includes a high-level description of what needs to be implemented. You can assign these tasks to an AI to generate code, documentation, or both.

---

## 1. Encounter Durable Object

1. **Round & Turn Tracking**

   - Create and maintain an integer property, `roundNumber`, which increments after each full cycle of initiative.
   - Store a list or array, `initiativeOrder`, that contains the IDs of all participating characters in sorted order.
   - Keep an integer pointer, `currentTurnIndex`, referencing the active character.

2. **State Management**

   - Implement `mapState` to hold grid coordinates or location data for each character/NPC.
   - Create a structure to store teams (e.g., “Party”, “Enemies”) for easy referencing.
   - Maintain an `encounterLog` array or list for chronological logging of actions/events.

3. **WebSocket Connections**

   - Set up connections (e.g., via Partykit) so players and Character Durable Objects can join or leave.
   - Implement a broadcast function that sends messages or updates to all active connections.

4. **Communication with Character DOs**

   - Provide methods to request character stats and abilities from Character Durable Objects.
   - Handle incoming action or effect requests, then forward results (e.g., damage, conditions) back to relevant characters.

5. **Coordinating Actions & Effects**

   - Write logic to handle single-target and area-of-effect actions.
   - Integrate dice-rolling methods (if available) or placeholders for any needed random logic.
   - Update characters’ HP or status based on results and log changes.

6. **Running Chat Log**

   - Maintain a universal feed for all encounter actions (e.g., movement, attacks, ability usage).
   - Invoke Character DO AI logic to generate flavor responses when characters are affected.

7. **Ending the Encounter**
   - Write a method to determine when the encounter ends (e.g., all enemies defeated).
   - Trigger a Cloudflare Workflow to:
     1. Summarize the encounter.
     2. Extract highlight/lowlights/funny moments.
     3. Generate Midjourney-style prompts for each highlight.
     4. Add generated images to a gallery.

---

## 2. Character Durable Object

1. **Core Character Data**

   - Store basic properties: name, backstory, alignment, appearance.
   - Maintain stats (e.g., STR, DEX) and abilities (e.g., spells, unique features).
   - Track hit points: current HP and max HP (optional).

2. **Inventory**

   - Implement a simple list of items (e.g., `[ "sword", "shield", "health potion" ]`).
   - Provide methods for adding/removing items.

3. **WebSocket Connection**

   - Set up a private WebSocket so the player or DM can message this Character DO directly.
   - Handle disconnect/reconnect logic.

4. **LLM Integration**

   - Keep a `systemPrompt` for the character’s personality and flavor.
   - Implement a `generateResponse(context)` method that calls an LLM to produce in-character dialogue.

5. **Methods for Communication**
   - **Incoming**: Parse messages from the DM or Encounter DO (e.g., “You got hit for 5 damage.”).
   - **Outgoing**: On an `@` mention or event, generate an AI reply and send it to the Encounter DO for broadcast.

---

## 3. The Game Loop

1. **Encounter Initialization**

   - Write a `startEncounter()` function that sets up map size, participants, and environment data.
   - Register Character DO references within the Encounter DO, adding a summary to the log.

2. **Broadcast & Dialogue**

   - Prompt each character at round start to speak or act.
   - Append all responses to the global `encounterLog`.

3. **Active Character’s Turn**
   - Send a context prompt (map, chat, possible actions) to the active character.
   - Process the character’s chosen action (dice rolls, HP updates, etc.).
   - Move to the next character in the initiative order.

---

## 4. The Turn (D&D Core Actions)

1. **Action**

   - Support basic actions (Attack, Cast Spell, Dash, etc.).
   - Check if the character can perform this action (not unconscious or otherwise disabled).

2. **Movement**

   - Let characters move up to their speed in squares.
   - Optionally validate movement if implementing Basic Movement Validation (walls, obstacles, etc.).

3. **Bonus Action**

   - If a character has a bonus action (due to class or ability), process that as well.

4. **Free Object Interaction**
   - Allow simple interactions like drawing a weapon or opening a door, and log them.

---

## 5. Encounter Chat

1. **Public Broadcast**

   - Implement a method to send a message to all connected clients.
   - Add every event/message to the `encounterLog`.

2. **Interaction Hooks**
   - Detect `@CharacterName` mentions and trigger that Character DO’s `generateResponse` method.
   - Optionally have random AI interjections for flavor.

---

## 6. DM Chat

1. **Private WebSocket**

   - Establish a separate or private channel for the DM to message a single Character DO directly.

2. **Secrecy**
   - Do not publish these messages in the main encounter or party chat.
   - Let the DM pass secret info (hidden traps, instructions, etc.).

---

## 7. Character Chat

1. **Private Chat Session**

   - Maintain a WebSocket exclusively between the player’s browser and the Character DO.
   - Ensure no one else can read these messages.

2. **LLM Integration**
   - Allow the player to converse with the character to plan or role-play.
   - (Optional) Limit usage frequency if you want to control gameplay pacing.

---

## 8. Party Chat

1. **Group Broadcast**

   - Broadcast only to Character DOs and human players on the “Party” team.
   - Mark these messages as “Party Only” or store them separately from public logs.

2. **Character AI Participation**
   - Allow `@` mentions in party chat to get character advice.
   - Randomly prompt a character for commentary to simulate lively chatter.

---

## 9. Ending an Encounter

1. **Trigger Workflow**

   - On encounter end, invoke a Cloudflare Workflow to produce an epilogue summary.
   - Mention who dealt final blows, critical hits, or near misses.

2. **Highlights & Lowlights**

   - From the `encounterLog`, extract top memorable moments (funny, heroic, etc.).

3. **Midjourney-Style Prompts**
   - For each highlight, produce a short scene description including relevant characters’ appearance and environment info.
   - Save or display generated images in a gallery.

---

## 10. Dice Rolling Mechanic

1. **Dice Rolling Endpoint**

   - Implement a `rollDice(diceSpec)` function returning a random integer result.
   - Parse notation like `"1d20+5"` or `"2d6"`.

2. **Randomness Source**

   - Use a reliable RNG (e.g., `crypto.getRandomValues`) to ensure fair results.

3. **Usage in Encounters**

   - Whenever an attack or skill check is needed, call `rollDice(...)`.
   - Broadcast results as needed (DM, player, or entire group).

4. **Modifiers (Minimal)**
   - Parse numeric modifiers and add to the result.
   - Example: `rollDice("1d20+3")` → returns the d20 roll plus 3.

---

## 11. Damage and Combat Resolution

1. **Damage Calculation**

   - Create a function `calculateDamage(attackData)` to handle basic formulas (dice roll + STR/DEX).
   - Use the dice rolling mechanic for random components.

2. **Applying Damage**

   - On a successful attack:
     1. Roll to hit (if relevant).
     2. Roll damage.
     3. Subtract HP from the target’s Character DO.

3. **HP Update & Log**

   - Encounter DO notifies the target’s Character DO to update HP.
   - Log HP changes in the encounter log (and possibly DM or party chat).

4. **Edge Cases**
   - Clamp HP to a minimum of 0.
   - Mark characters as unconscious if HP hits 0.

---

## 12. Simple Condition / Status Tracking

1. **Condition List (Minimal)**

   - Track “Unconscious” if HP ≤ 0.
   - (Optional) Add a few more conditions like “Stunned” or “Grappled.”

2. **Storage**

   - In each Character DO, maintain a `conditions: Set<string>` or similar structure.

3. **Condition Effects**

   - Encounter DO checks conditions before allowing actions.
   - Skip turns if “Unconscious.”

4. **Updating Conditions**
   - Encounter DO adds/removes conditions when events happen (e.g., healing removes “Unconscious”).
   - Append condition changes to the encounter log.

---

## 13. Basic Movement Validation

1. **Speed & Grid**

   - Store a `speed` stat in each Character DO.
   - Assume 5-ft squares (e.g., 30 ft → 6 squares).

2. **Movement Action**

   - Implement `moveCharacter(characterId, newX, newY)` in Encounter DO.
   - Check the distance moved vs. available speed.

3. **Obstacles (Optional)**

   - (Optional) Store impassable squares or terrain in `mapState`.
   - Block movement if crossing those squares.

4. **Broadcast Updates**
   - Notify all participants when movement is successful or partially blocked.

---

## 14. Initiative Rolling / Ordering

1. **Initiative Roll**

   - Each Character DO uses `rollDice("1d20 + initiativeModifier")` at the encounter start.
   - Store results in a temporary property, like `initiativeRoll`.

2. **Sort Order**

   - Encounter DO sorts by descending roll result, populating `initiativeOrder`.

3. **Ties (Optional)**

   - Decide on a method (e.g., compare DEX or re-roll) to break ties.

4. **Turn Progression**

   - Use `currentTurnIndex` to track whose turn it is.
   - After each turn, increment index and loop when reaching the end.

5. **Resets**
   - Allow re-rolling initiative if more enemies arrive mid-encounter or if the situation changes.

---

**Use this list as a backlog of tasks for any AI-based or human development process.** You can proceed item by item to generate code, documentation, or perform testing and integration.
