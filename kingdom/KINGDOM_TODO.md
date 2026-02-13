# Kingdom TUI: Complete Feature Todo List

> Full recreation of Kingdom Two Crowns as a terminal-based game using blECSd.
> Current status: ~20-25% complete. Core ECS framework, basic units, walls, day/night, and combat exist.
> This document tracks EVERY feature needed for a complete recreation (minus graphics/pixel art).

---

## STATUS LEGEND
- [ ] Not started
- [x] Implemented
- [~] Partially implemented (needs work)

---

## 1. TOWN CENTER / CASTLE PROGRESSION

The heart of the kingdom. Upgrading unlocks new technologies and unit types.

- [ ] **Town Center upgrade system** (6 tiers with costs and cooldowns)
  - [ ] Tier 0: Unlit Campfire (starting ruins, found on each island)
  - [ ] Tier 1: Campfire (1-3 coins) - unlocks hammer + bow tool stands
  - [ ] Tier 2: Camp (3-6 coins) - unlocks second tool stand set
  - [ ] Tier 3: Village (6-9 coins) - unlocks scythe vendor (farmers), free inner spike walls
  - [ ] Tier 4: Town Hall (7-12 coins) - unlocks Banker NPC, siege workshop
  - [ ] Tier 5: Stone Fortifications (8-15 coins, requires Stone tech) - free stone walls + watchtowers, pike shop
  - [ ] Tier 6: Castle Keep (9-18 coins, requires Iron tech) - shields for knights, gem keeper
  - [ ] Tier 7: Iron Keep (20 coins, Two Crowns only) - bomb banner, forge, free roofed triplet towers
- [ ] Upgrade cooldown timer between tiers
- [ ] Visual representation for each tier (distinct TUI chars)
- [ ] Town center generates tool stands automatically per tier
- [ ] Town center destruction = game over

---

## 2. WALL SYSTEM

- [~] **Wall tiers** (currently 3: wood/stone/iron, need 5 tiers)
  - [ ] Tier 1: Spikes/Dirt Mound (1 coin, 25 HP)
  - [~] Tier 2: Wooden Palisade (3 coins, 50 HP)
  - [~] Tier 3: Stone Wall (6 coins, 200 HP, requires Stone tech)
  - [ ] Tier 4: Tall Stone Wall (9 coins, 300 HP)
  - [~] Tier 5: Iron Wall (12 coins, 400 HP, requires Iron tech)
- [ ] Blessed wall HP bonus (statue buff: +30-83% HP)
- [ ] Proper decay resistance per tier (Tier 1: 2 days, Tier 5: 20 days)
- [x] Wall chain bonuses (adjacent walls get +N HP)
- [x] Auto-gates every 10 tiles from settlement center
- [x] Gates block greed, allow friendlies
- [ ] Walls expand outward only from town center (sequential placement rule)
- [ ] Wall destruction drops builders' tools (builders revert to vagrant)

---

## 3. TOWER SYSTEM

- [~] **Tower tiers** (currently 1 type, need 6 tiers)
  - [ ] Tier 1: Rock Platform (3 coins, 1 archer)
  - [ ] Tier 2: Wooden Watchtower (5 coins, 1 archer, medium height)
  - [ ] Tier 3: Stone Tower (7 coins, 2 archers, requires Stone tech)
  - [ ] Tier 4: Triplet Tower (9 coins, 3 archers)
  - [ ] Tier 5: Roofed Triplet (requires Iron tech, 3 covered archers, floater-proof)
  - [ ] Tier 6: Quadruplet Tower (4 covered archers, all elevated)
- [~] Tower archer slots and range bonus (basic version exists)
- [ ] Roofed towers protect archers from floater abduction
- [ ] Tower placement only on outermost maxed walls

### Special Tower Conversions (via Hermits)
- [ ] Ballista Tower (Ballista Hermit, 6 coins, 1 builder operates)
- [ ] Fire Tower (Fire Tower Hermit, 1 builder + 1 archer)
- [ ] Bakery Tower (Bakery Hermit, 6 coins, produces 7 bread loaves)
- [ ] Knight Tower (Knight Hermit, 6 coins, produces 1 shield)
- [ ] Berserker Tower (Berserker Hermit, produces 1 potion)

---

## 4. FARM SYSTEM

- [~] **Farm tiers** (basic version exists, needs proper mechanics)
  - [~] Water Well / Basic Farm (3-5 coins, up to 4 crop plots, 1 farmer)
  - [~] Mill House / Farmhouse (8 coins upgrade, up to 6 plots, overnight shelter)
  - [ ] Farmer Statue blessing (+2 additional plots per farm)
- [~] Crop growth cycle (~1 day to mature)
- [~] Harvest amounts (4 coins Classic, 6 coins Two Crowns per plot)
- [ ] Farmers retreat to town at night if no farmhouse
- [ ] Farmers stay at farmhouse if upgraded
- [ ] Farm destruction by greed (farm reverts to wild land)
- [ ] Seasonal effects on farming (spring/summer normal, autumn 75%, winter 0%)
- [ ] Berry bush foraging in winter (Two Crowns)
- [ ] Max 3 farms per side (6 total)
- [ ] Farms built near water streams

---

## 5. SIEGE WEAPONS

- [~] **Ballista** (basic version in siege.ts)
  - [~] 12 coin cost, 3 damage in 3-tile AoE
  - [ ] Operated by builders (1-2 crew)
  - [ ] Proper piercing damage (hits multiple greed in a line)
- [ ] **Catapult** (NOT implemented)
  - [ ] 6 coins to build, requires siege workshop (Town Tier 4+)
  - [ ] 1-2 builders operate
  - [ ] ~15 damage per shot, AoE
  - [ ] Can one-shot floaters
  - [ ] Stone ammunition (standard)
  - [ ] Fire barrels (5 coins each, Two Crowns castle keep+)
  - [ ] Breeders can pick up and throw back boulders
  - [ ] One catapult per side maximum
- [ ] **Bomb** (NOT implemented)
  - [ ] 18 coins at Iron Keep
  - [ ] 3 builders push it toward cave portal
  - [ ] 5 coins to enter cave
  - [ ] 5 coins to ignite at hive
  - [ ] 15-30 second escape timer
  - [ ] Destroys cave portal permanently
  - [ ] Knights must escort

---

## 6. LIGHTHOUSE

- [ ] **Lighthouse structure** (NOT implemented)
  - [ ] Found at island edge (cape side)
  - [ ] 3 upgrade tiers: Wooden (6 coins), Stone (12 coins), Iron (18 coins)
  - [ ] Enables safe boat landing when returning to island
  - [ ] Decay prevention: adds 10/20/30 days per tier
  - [ ] Without lighthouse, returning boat crashes
  - [ ] Only decays after ALL walls on island destroyed

---

## 7. FORGE

- [ ] **Forge structure** (NOT implemented)
  - [ ] Found on islands 3+ as ruins
  - [ ] 6-10 coins to repair
  - [ ] Produces iron swords (12 coins each)
  - [ ] Squires pick up swords to become full Knights
  - [ ] Requires Iron Keep tier + iron back wall

---

## 8. MONARCH & MOUNTS

- [x] Monarch movement (walking, running)
- [x] Coin dropping mechanic (one-shot rising edge)
- [x] Basic horse mount (1.5x speed, 2x sprint)
- [x] Stamina system (100 max, depletion/recharge)
- [~] Speed boost (exists but was moved from index.ts)
- [ ] **Crown mechanic** (NOT implemented)
  - [ ] Crown knocked off when hit with 0 coins
  - [ ] Crown can be recovered if greedling killed before reaching portal
  - [ ] Crown lost = game over (currently just GamePhase.GameOver)
  - [ ] Crown animation/visual when dropped
- [ ] **Multiple mount types** (only horse exists)
  - [ ] Griffin (2 gems, 8 coins) - wing-flap knockback, faster
  - [ ] Stag (1 gem, 3 coins) - forest speed bonus, attracts deer
  - [ ] Warhorse (2 gems, 8 coins) - ally invincibility skill (10s)
  - [ ] Wild Horse (1 gem, 4 coins) - highest stamina, forest speed
  - [ ] Bear (3 gems, 11 coins) - creature pounce instakill, slow
  - [ ] Lizard (3 gems, 10 coins) - fire breath, sun-dependent recovery
  - [ ] Unicorn (4 gems, 12 coins) - grass eating generates 3 coins
- [ ] Mount loss on monarch hit (mount returns to stable)
- [ ] Mount switching at stables (3 coins per switch)
- [ ] Mount-specific grazing mechanics (grass, berries, sun, etc.)
- [ ] Gem costs for mount unlocks

---

## 9. UNIT TYPES

### Vagrants & Recruitment
- [x] Vagrant spawning from camps
- [x] 5 NPC origin types (Standard/Warrior/Scout/Craftsman/Peasant)
- [x] Coin-based recruitment
- [ ] Bread-based recruitment (from Bakery)
- [ ] Vagrant camp locations in forest
- [ ] Vagrants freeze and crouch when threatened

### Archers
- [x] Bow recruitment (2 coins)
- [x] Daytime hunting behavior
- [x] Nighttime wall defense
- [x] Kill-based leveling (range/cooldown)
- [x] Scout origin bonus (+3 range)
- [ ] Tower assignments (dedicated tower archers vs ground hunters)
- [ ] Accuracy: 33% ground, ~100% from towers
- [ ] Can carry up to 11 coins
- [ ] Even distribution between left/right sides
- [ ] Blessed aim (statue buff: perfect accuracy)

### Builders
- [x] Hammer recruitment (3 coins, currently 2)
- [x] Build/repair walls
- [x] Auto-defensive wall placement
- [x] Craftsman origin bonus (1.5x speed)
- [ ] Tree cutting for coins/clearing land
- [ ] Operate catapults and ballistas (1-2 builders)
- [ ] Push bombs toward caves
- [ ] Push boats to dock
- [ ] Roll fire barrels to catapults
- [ ] No self-preservation at night (execute orders regardless of danger)
- [ ] Idle behavior: head toward nearest outer wall
- [ ] Can carry up to 2 coins

### Farmers
- [x] Farm working with production multipliers
- [x] Peasant origin bonus (+50% output)
- [ ] Proper scythe/pitchfork recruitment (4 coins, Town Center Tier 3)
- [ ] Return to town center at night (no farmhouse)
- [ ] Stay at farmhouse overnight (upgraded farm)
- [ ] Winter behavior: idle or berry foraging
- [ ] Can carry up to 14 coins

### Knights / Squad Leaders
- [~] Knight recruitment (exists, needs squire/knight split)
- [ ] **Squire tier** (4 coins for shield)
  - [ ] Squire commands 4 archers as a squad
  - [ ] Shield absorbs multiple hits
  - [ ] Can carry 5 coins
- [ ] **Knight tier** (12 coins for iron sword at forge)
  - [ ] Promoted from squire
  - [ ] Enhanced combat capability
  - [ ] Can carry 11 coins
- [ ] Portal assault mechanic (drop coin at wall banner to send knight + squad)
- [ ] Knight charge behavior
- [ ] Defensive shield wall formation at outer walls
- [ ] Knight escort for bomb transport
- [ ] Boat escort duty

### Pikemen / Ninjas (NOT implemented)
- [ ] Pike recruitment (2 coins, requires pike vendor at Stone tier)
- [ ] Daytime fishing (1 coin per fish, riverside)
- [ ] Nighttime defense at outer walls
- [ ] Pike thrust: AoE damage killing multiple greedlings
- [ ] Formation of 8 per wall section (alternating pike angles)
- [ ] Effective against floaters and crown stealers
- [ ] Pike durability (degrades per kill, not per thrust)
- [ ] Ninja variant (Shogun DLC)

### Hermits (NOT implemented - 7 types)
- [ ] **Hermit system** (ride on monarch's mount, one at a time)
- [ ] Hermit cottages in forests (island-specific)
- [ ] Gem cost to coax + coin to mount
- [ ] Hermit kidnapping by greed (rescue via bomb/cave destruction)
- [ ] **Ballista Hermit** (Island 1, 3 gems) - converts towers to ballistas
- [ ] **Stable Hermit** (Island 2, 1 gem) - farmhouse conversion, mount summoning
- [ ] **Bakery Hermit** (Island 3, 4 gems) - tower to bakery, bread production
- [ ] **Knight Hermit** (Island 4, 2 gems) - tower to squire tower, armor forging
- [ ] **Horn Hermit** (Island 5, 3 gems) - wall to horn wall, nightly troop reinforcement
- [ ] **Fire Tower Hermit** - converts towers to fire towers
- [ ] **Berserker Hermit** - converts towers to berserker towers

### Dog Companion (NOT implemented)
- [ ] Found under fallen tree on Island 2
- [ ] 1 coin to free (coin returned)
- [ ] Follows monarch, warns of approaching greed (barks toward threat)
- [ ] Can be kidnapped by greedlings
- [ ] Recovery via bomb, crown loss, or ransom

### Merchant NPC (NOT implemented)
- [ ] Appears on Islands 1-2 only
- [ ] Pay 1 coin, returns 8 coins (7-coin profit)
- [ ] Daytime only, not during danger
- [ ] Camp in forest (destroyed if trees cut)

### Banker NPC (NOT implemented)
- [ ] Appears at Town Hall (Tier 4+)
- [ ] Daytime only (dawn bell to sunset)
- [ ] Deposit coins (walks to castle door at 10+ coins)
- [ ] Withdrawal: smaller of 1/3 stored or pouch capacity
- [ ] Interest: 7% daily (3-100 coins), 8 coins max (101+ coins)
- [ ] Coins persist across islands in Two Crowns
- [ ] Transfer to heirs on crown loss

---

## 10. GREED ENEMY TYPES

### Basic Greedling
- [x] 1 HP, moderate speed
- [x] Steal coins from monarch
- [x] Wall damage
- [ ] Tool theft (stolen tool = subject reverts to vagrant)
- [ ] Flee at sunrise (retreat to portal)
- [ ] ~1 charge per second attack rate

### Masked Greedling
- [x] 2+ HP (mask absorbs first hit)
- [x] 50% armor vs basic arrows (bypassed by tower archers)
- [ ] Significantly more wall damage than basic
- [ ] Front mask visual (breaks off after first hit)

### Floater
- [~] Flies over walls (basic version exists)
- [ ] 12 HP (currently much less)
- [ ] Slow flight speed
- [ ] **Abducts 2 villagers** (grab and carry to portal) - NOT stealing coins
- [ ] Ignores coins and tools entirely
- [ ] Targets townspeople exclusively
- [ ] First appears during 3rd Blood Moon
- [ ] Does NOT flee at sunrise (fights until dead)
- [ ] Countered by roofed towers, catapults, heavy archer fire
- [ ] Creates "trains of floaters" in late game

### Breeder
- [~] Basic version exists (3 HP, spawns 2 mini-greeds)
- [ ] Proper breeder: ~70 HP tank
- [ ] Punch attack (knocks down swathes of defenders, disarms them)
- [ ] Boulder throwing (picks up catapult stones, hurls at walls/soldiers)
- [ ] Continuous greedling spawning (4 greed every few seconds)
- [ ] Mount fear (monarch's mount panics briefly near breeders)
- [ ] Does NOT flee at sunrise
- [ ] Armored variant (late game, wears mask, spawns masked greedlings)

### Crown Stealer
- [~] Basic version exists (pathfinds around walls)
- [ ] 8 HP (currently 2)
- [ ] Faster than any mount
- [ ] Bypasses walls, coins, gems entirely
- [ ] Instantly knocks crown off on contact
- [ ] Crown lost forever if not recovered in seconds
- [ ] Can ride breeders
- [ ] Constellation warning in sky before first appearance
- [ ] Eerie creaking sound on portal exit
- [ ] First appears: Blood Moons around day 130, regular waves day 190+

### Crusher (NOT implemented - Norse Lands / Call of Olympus)
- [ ] ~20 hits to defeat
- [ ] Armored shell (invulnerable to arrows)
- [ ] Charge attack (destroys weak walls, knocks down subjects)
- [ ] Slower than greedlings, faster than breeders
- [ ] Stunned after charge against strong walls or shield walls
- [ ] Appears around night 30+
- [ ] Retreats when all accompanying greedlings eliminated

---

## 11. WAVE SYSTEM

- [~] Nightly waves from active portals
- [x] Per-portal difficulty scaling
- [x] Wave composition by day count (basic -> masked -> floater -> breeder -> crown stealer)
- [x] Blood moons every 7 days (3x multiplier)
- [x] Roaming bands during day
- [x] Retaliation waves on portal destruction
- [ ] **Proper wave scaling formula** based on day count + island multiplier
  - [ ] Island 1: 1.0x, Island 2: 1.25x, Island 3: 1.5x, Island 4: 1.75x, Island 5: 2.0x
- [ ] Waves timed to reach kingdom borders by midnight
- [ ] Blood moon duration: does not end until ALL monsters defeated
- [ ] Recovery: peaceful night after blood moon
- [ ] One-sided waves (attack one flank from random portal)
- [ ] Portal defense waves (triggered when attacking a portal)
  - [ ] Continuous small groups during portal assault
  - [ ] Difficulty ramps smoothly over time
- [ ] Proper blood moon schedule (every 4-6 days, not fixed 7)
  - [ ] Two Crowns: ~2 days before season change
  - [ ] Year 3+: frequency doubles (two per season)
- [ ] Blood moon visual indicators (red sky, stormy day, reddish day counter)
- [ ] Audio cue: rumbling 40 seconds before midnight

---

## 12. ISLAND PROGRESSION

- [~] 5 islands with difficulty scaling (basic ship transition exists)
- [ ] **Island 1: Tutorial**
  - [ ] Smallest map, no small portals, no gem chests
  - [ ] 1 cliff portal, 2 dock portals
  - [ ] Unlockables: Archery Statue (3 gems, 10 coins), Griffin (2 gems, 8 coins), Ballista Hermit
  - [ ] 3 vagrant camps, merchant present, 3 coin chests (36 coins)
  - [ ] Ghost of past monarch tutorial
- [ ] **Island 2: Stone Tech**
  - [ ] Introduces gem chests, 1 small portal per side
  - [ ] Unlockables: Stone Mine (10 coins), Farmer Statue (1 gem), Stag (1 gem), Stable Hermit
  - [ ] Dog companion available
- [ ] **Island 3: Forge Island**
  - [ ] 4-6 cliff portals + cave portal appears
  - [ ] Unlockables: Warhorse (2 gems), Baker Hermit (4 gems), Builder Statue (3 gems), Pony (1 gem)
  - [ ] Forge ruin for weapon upgrades
- [ ] **Island 4: Advanced Warfare**
  - [ ] No merchant, many portals
  - [ ] Unlockables: Bear (3 gems), Lizard (3 gems), Knight Hermit (2 gems)
  - [ ] First bomb access for cave destruction
- [ ] **Island 5: Final Island**
  - [ ] Maximum portals, extreme difficulty
  - [ ] Unlockables: Unicorn (4 gems), Knight Statue (2 gems), Horn Hermit (3 gems)
  - [ ] Victory: destroy ALL portals
- [ ] Island-specific map generation (size increases per island)
- [ ] Island-specific unlockable placement
- [ ] Island stats board tracking accomplishments
- [ ] Campaign completion message

---

## 13. GEM CURRENCY

- [ ] **Gem system** (NOT implemented)
  - [ ] Secondary currency, more valuable than coins
  - [ ] Persists across islands
  - [ ] Total gems available per campaign: 38 (standard), 41 (Norse)
  - [ ] Gem chests in forests (island 2+)
  - [ ] Portal destruction drops gems (cliff: 1-4, cave: 4-8)
  - [ ] Gems never vanish from ground
  - [ ] Gems only knocked out after ALL coins lost
  - [ ] Permanently lost if crown is lost
  - [ ] Gem Keeper NPC (Castle Keep tier) stores gems across islands
  - [ ] 1 coin per gem deposit/retrieval transaction
  - [ ] Uses: unlock mounts, statues, hermits

---

## 14. BOAT & SAILING

- [~] Ship exists for island transition (basic version in ship.ts)
- [ ] **Proper boat mechanics**
  - [ ] Boat wreck found at island edge
  - [ ] 10 coins to begin restoration
  - [ ] Hull pieces: 59 at 2 coins each (118 coins total)
  - [ ] Island 1: all pieces free, Island 2: 40 free
  - [ ] Builders hammer pieces into place
  - [ ] Uninstalled parts can be stolen by greedlings
  - [ ] 2 coins to launch (drops into river)
  - [ ] Builders push vessel toward dock
  - [ ] Dock bell: 2 coins to summon 3 workers + 3 knights
  - [ ] 10 coins to depart
  - [ ] Dog/hermits auto-board
  - [ ] Archers in crow's nest during transit (New Lands)
- [ ] Return to previous islands
- [ ] Island select screen

---

## 15. DECAY SYSTEM

- [ ] **Structure decay** (NOT implemented)
  - [ ] Begins when monarch leaves an island
  - [ ] Walls decay from outermost to innermost, by tier
  - [ ] Decay rates per wall tier: Tier 1 (2 days), Tier 2 (4 days), Tier 3 (8 days), Tier 4 (12 days), Tier 5 (20 days)
  - [ ] Lighthouse adds 10/20/30 days decay protection per tier
  - [ ] Subjects lose tools when all walls on one side decay
  - [ ] Archers abandon towers (towers remain intact)
  - [ ] Farms unprotected but intact
  - [ ] Crown loss = 100 days decay across ALL unlocked islands
  - [ ] Completed islands (all portals destroyed) no longer decay (since v2.0.0)
  - [ ] Banker coins persist through decay
  - [ ] Gems never decay

---

## 16. SEASONS

- [ ] **Seasonal system** (NOT implemented)
  - [ ] 4 seasons cycling: Spring -> Summer -> Autumn -> Winter
  - [ ] 16 days per season, 64 days full cycle
  - [ ] Seasons persist across islands (global day count)

### Spring
- [ ] Green grass, foliage appears
- [ ] Wildlife spawns regularly
- [ ] Farms fully productive
- [ ] Occasional rainfall visual

### Summer
- [ ] Peak farm productivity
- [ ] Maximum wildlife and tall grass
- [ ] No rainfall
- [ ] Ideal time to stockpile coins

### Autumn
- [ ] Leaves/cattails turn red (visual warning)
- [ ] Similar mechanics to earlier seasons
- [ ] Farm output reduced to ~75%

### Winter (16 days)
- [ ] Farms produce nothing, streams freeze
- [ ] Rabbit dens destroyed, deer cease spawning
- [ ] Berry bushes appear (farmer foraging, 12-16 coins per bush group)
- [ ] Single boar appears (worth 30 coins if killed)
- [ ] Only merchant income and banker interest remain
- [ ] Pikemen fishing continues (Europe)
- [ ] Mounts lose well-fed buff
- [ ] Shorter daylight, longer nights
- [ ] Snow visual effects

---

## 17. PORTAL MECHANICS

- [x] 5 portals across map
- [x] Per-portal difficulty scaling
- [x] Portal destruction (permanent)
- [x] Retaliation waves on destruction
- [x] Victory: all portals destroyed on island 5
- [ ] **Portal types** (currently all same)
  - [ ] Small cliff portals (scattered in forest)
  - [ ] Large cliff portals (further out)
  - [ ] Dock portals (at far side dock, has tentacle defense)
  - [ ] Cave portal (The Greed Nest, requires bomb to destroy)
- [ ] Portal-to-teleporter conversion (destroyed portals become teleport points)
- [ ] Portal assault by knight squads
- [ ] Portal defense waves during assault (continuous spawning)
- [ ] Portal HP that persists (damage is permanent)
- [ ] Gem drops from destroyed portals

---

## 18. STATUES

- [ ] **Statue system** (NOT implemented)
  - [ ] Found on specific islands, unlocked with gems, activated with coins
  - [ ] **Archer Statue** (Island 1, 4 gems unlock, 10 coins activate) - perfect accuracy
  - [ ] **Farmer Statue** (Island 2, 1 gem unlock, 7 coins activate) - +2 farmers per farm
  - [ ] **Builder Statue** (Island 3, 3 gems unlock, 9 coins activate) - wall HP amplification
  - [ ] **Knight Statue** (Island 5, 2 gems unlock, 9 coins activate) - jump-slash ability
  - [ ] Statue blessings increase wall HP by 30-83%
  - [ ] Statue effects are temporary (duration-based)

---

## 19. ECONOMY & INCOME

- [x] Coin economy (basic)
- [x] Hunting income (rabbits 1, deer 3)
- [x] Farm income with multipliers
- [x] Scaled recruitment costs
- [x] Gold vein mining
- [~] Shrine costs (base + inflation)
- [ ] **Dawn bonus** (2 coins every morning)
- [ ] **Merchant income** (1 coin investment -> 8 coins return)
- [ ] **Banker interest** (7% daily, capped at 8 coins)
- [ ] **Pikeman fishing** (1 coin per fish, daytime)
- [ ] **Food cache** consumables (+3 coins one-time, found in ruins)
- [ ] **Coin bag capacity** per unit type:
  - [ ] Peasant/Builder: 2 coins
  - [ ] Archer/Knight: 11 coins
  - [ ] Farmer: 14 coins
  - [ ] Pikeman/Ninja: 0 coins
  - [ ] Squire: 5 coins
- [ ] Coin overflow: 50/50 drop or discard into water
- [ ] **Tax chest** (Classic: 5 coins/day at Tier 1, increases with tier)

---

## 20. COUNTER-ATTACK / OFFENSIVE SYSTEM

- [~] Knights attack portals (basic version)
- [ ] **Proper portal assault**
  - [ ] Drop coin at outermost wall banner to dispatch knight + squad
  - [ ] Knight + 4 archers march toward nearest portal
  - [ ] Knights defend archers, archers split attention (greed + portal)
  - [ ] Portal damage is permanent (does not regenerate)
  - [ ] Portal defense waves scale smoothly over time
- [ ] **Catapult assault** (builders push catapult toward portal)
- [ ] **Bomb assault** (builders push bomb to cave, knights escort)
  - [ ] Cave interior: hives equal to island number
  - [ ] Greed Nest core requires coin to light bomb
  - [ ] 4-day restoration timer
  - [ ] Escape sequence (15-30 seconds)

---

## 21. SAVE / LOAD / PERSISTENCE

- [x] JSON save/load to ~/.kingdom-save.json
- [x] Auto-save every 30 seconds
- [ ] Per-island save state (multiple islands with independent state)
- [ ] Cross-island persistence (gems, global day count, unlocks)
- [ ] Banker coins persist across islands
- [ ] Heir succession on crown loss (return to same island with some decay)
- [ ] Island unlock tracking
- [ ] Stats board per island

---

## 22. RENDERING & UI

- [x] Terminal-based TUI with blECSd CellBuffer
- [x] Day/night sky color transitions
- [x] Structure rendering (walls, campfire, farms, towers)
- [x] Unit rendering with distinct chars/colors
- [x] NPC subtype visual distinction
- [x] Greed rendering
- [x] Projectile rendering
- [x] Animal rendering (rabbits/deer)
- [x] Dropped coin rendering (pulsing)
- [x] Blueprint/construction rendering
- [x] Wall HP bars above damaged walls
- [x] HUD with coins, day count, time, unit counts
- [x] Interactable prompt display
- [x] Night overlay
- [x] Parallax stars/clouds
- [x] Screen shake on wall breach
- [x] Message log (last 3 messages)
- [ ] **Title screen** (proper menu with New Game / Continue / Island Select)
- [ ] **Game over screen** (crown lost animation)
- [ ] **Victory screen** (campaign completion)
- [ ] **Island select / map screen**
- [ ] **Blood moon visual** (red sky tint, stormy daytime)
- [ ] **Seasonal visual changes** (green spring, yellow autumn, white winter snow)
- [ ] **Weather effects** (rain, snow, wind)
- [ ] **Crown animation** (bouncing when knocked off)
- [ ] **Coin sparkle effects** when picked up
- [ ] **Sunrise/sunset color gradient** transitions
- [ ] **Water reflections** / animated water
- [ ] **Campfire glow radius** (warm light around fire)
- [ ] **Northern lights** (Norse Lands winter)
- [ ] **Constellation warning** (crown stealer sky pattern)
- [ ] **Minimap** or expanded map view

---

## 23. AUDIO / SOUND

- [~] Terminal bell on events (basic)
- [ ] **Sound effects** (terminal beep patterns)
  - [ ] Coin pickup sound
  - [ ] Wall breach alert
  - [ ] Blood moon warning rumble
  - [ ] Sunrise/sunset bell
  - [ ] Greed approach warning (dog bark)
  - [ ] Crown stealer creaking sound
  - [ ] Build completion sound
  - [ ] Recruitment sound

---

## 24. INPUT & CONTROLS

- [x] Arrow keys / A/D for movement
- [x] Shift for sprint
- [x] Space for coin drop
- [x] Held-key tracking (120ms expiry)
- [ ] **Additional controls**
  - [ ] Enter/E for interaction (recruit, activate shrine, enter boat)
  - [ ] Number keys for quick actions
  - [ ] Tab for minimap toggle
  - [ ] Q for quit/menu
  - [ ] P for pause
  - [ ] Direction-specific coin drop (left/right)

---

## 25. CHALLENGE ISLANDS (Post-Game Content)

- [ ] Skull Island (survive as long as possible, hourglass statue delays defeat)
- [ ] Dire Island (harder variant)
- [ ] Plague Island (parasites that climb walls)
- [ ] Trade Routes
- [ ] Lost Islands

---

## 26. CO-OP / MULTIPLAYER

- [ ] Two-monarch system
- [ ] Shared kingdom
- [ ] Split resources
- [ ] Both monarchs must board boat to sail
- [ ] Independent crown mechanics

---

## PRIORITY ORDER FOR IMPLEMENTATION

### Phase 6: Core Systems Foundation
1. Town Center upgrade system (6-7 tiers)
2. Proper wall tiers (5 levels with costs/HP)
3. Proper tower tiers (6 levels with archer capacity)
4. Gem currency system
5. Seasonal system (4 seasons, 16 days each)

### Phase 7: NPCs & Economy
6. Banker NPC (interest, deposits, withdrawals)
7. Merchant NPC (income source)
8. Pikemen/Ninja unit type (fishing + pike combat)
9. Squire/Knight progression (shield -> sword)
10. Dog companion

### Phase 8: Structures & Tech
11. Catapult (build, operate, fire)
12. Bomb (build, push, cave destruction)
13. Lighthouse (decay prevention, safe landing)
14. Forge (iron swords, knight promotion)
15. Proper farm upgrades (farmhouse with shelter)

### Phase 9: Enemy Overhaul
16. Proper breeder (70 HP, punch, boulder throw, continuous spawning)
17. Proper floater (12 HP, villager abduction, ignore coins)
18. Proper crown stealer (8 HP, faster than mounts, bypass walls)
19. Crusher/Boss greed (armored, charge attack)
20. Improved wave scaling (day count + island multiplier)

### Phase 10: Island & Progression
21. Island-specific map generation (size, portals, features)
22. Island-specific unlockables (mounts, hermits, statues)
23. Proper boat mechanics (hull pieces, boarding, dock bell)
24. Decay system (structure degradation on island departure)
25. Portal-to-teleporter conversion

### Phase 11: Hermits & Mounts
26. Hermit system (7 types, cottage locations, gem costs)
27. Multiple mount types (7+ with unique abilities)
28. Statue system (4+ types with gem unlocks and activation buffs)
29. Special tower conversions (ballista, bakery, knight, fire, berserker)

### Phase 12: Polish & Completeness
30. Counter-attack system (knight portal assault with banner mechanic)
31. Title screen, game over, victory, island select screens
32. Seasonal visual effects (spring green, autumn red, winter snow)
33. Blood moon visual/audio indicators
34. Proper save/load with per-island state
35. Weather effects (rain, snow)
36. Challenge islands (post-game content)
37. Co-op multiplayer (stretch goal)

---

## IMPLEMENTATION NOTES

### File Ownership (Agent Assignments)
- **Agent 1 (Rendering/Core):** renderer.ts, hud.ts, index.ts, types.ts, terrain.ts, map.ts, camera.ts, effects.ts, sound.ts
- **Agent 2 (Entities/Economy):** monarch.ts, villager.ts, builder.ts, archer.ts, farmer.ts, knight.ts, animals.ts, mount.ts, economy.ts, ai.ts
- **Agent 3 (Systems/Structures):** combat.ts, wall.ts, portal.ts, resources.ts, shrine.ts, ship.ts, siege.ts, spawn.ts, construction.ts, movement.ts, greed.ts

### New Files Likely Needed
- `entities/pikeman.ts` - Pikeman/ninja unit
- `entities/hermit.ts` - Hermit NPC system
- `entities/dog.ts` - Dog companion
- `entities/merchant.ts` - Merchant NPC
- `entities/banker.ts` - Banker NPC
- `structures/townCenter.ts` - Town center upgrade tiers
- `structures/catapult.ts` - Catapult weapon
- `structures/bomb.ts` - Bomb for cave destruction
- `structures/lighthouse.ts` - Lighthouse structure
- `structures/forge.ts` - Forge for iron swords
- `structures/statue.ts` - Statue blessing system
- `systems/seasons.ts` - Seasonal cycle and effects
- `systems/gems.ts` - Gem currency system
- `systems/decay.ts` - Island decay mechanics
- `systems/teleporter.ts` - Portal-to-teleporter conversion
- `game/islandSelect.ts` - Island selection screen
- `game/titleScreen.ts` - Title/menu screen
