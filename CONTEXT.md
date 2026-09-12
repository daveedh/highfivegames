# Instructions Not Included

A first-person browser game set in one flat-pack furniture showroom, where you take things off the shelves and fire them from a slingshot at robot security guards. This glossary is the shared vocabulary for the game's world and mechanics — the words to use in code, tickets and conversation.

## Language

### The world

**Instructions Not Included**:
The game. A real flat-pack phrase played completely straight — it describes the furniture, the robots, and the fact that nothing ever tells you what to do.
_Avoid_: Flat-pack Escape, the working title

**FLATPÄK SKRÄPBO**:
The store the game takes place in. Invented Scandinavian, a clear parody with its own name — never one letter off a real chain. Written `Flatpak Skrapbo` outside signage (see **Umlaut convention**).
_Avoid_: IKEA, the shop

**Showroom**:
The single floor the whole game occupies: a one-way snake of zones with no dead ends, entered and exited through two doors in the same corner.
_Avoid_: level, map, store floor

**Zone**:
One themed room along the showroom's route — Living Rooms, Dining, Bedrooms, Kitchens, Children's, Market Hall. Zones set the merchandise and the guard territory.
_Avoid_: room, area, section

**PA**:
The store's public address system. Speaks in a calm, normal tone regardless of what is happening (see **Deadpan rule**).
_Avoid_: announcer, narrator, voiceover

### Merchandise and the slingshot

**Merchandise**:
Everything the store sells and displays. Most of it is scenery.
_Avoid_: props, items, stock

**Throwable**:
Merchandise you can pick up and fire. Marked in-world by yellow price-tag shelf edges. Nothing restocks — a fired throwable lies where it lands and can be collected again.
_Avoid_: ammo, projectile, pickup

**Weight tier**:
A throwable's class — **Light**, **Medium** or **Heavy** — which sets how much damage it does and how much of the pouch it occupies. Heavy also knocks a guard down.
_Avoid_: size, weight class, rarity

**Pouch**:
What you carry throwables in. It holds a fixed number of slots, loads automatically in pickup order, and fires in that same order.
_Avoid_: inventory, backpack, ammo belt

**Slingshot**:
The only weapon. Fired by pulling, holding and releasing; a fuller pull is faster, flatter and straighter.
_Avoid_: catapult, sling, gun

**Pull**:
The act of drawing the slingshot back. Costs mobility while held, which is the central trade of the game's combat.
_Avoid_: charge-up, aim, windup

### Guards

**Guard**:
A robot security guard patrolling the showroom. Behaves like professional security at all times, never comically. Its body colour is the readout of what it currently thinks is going on.
_Avoid_: robot, enemy, security bot

**Zoned guard**:
A guard that patrols a fixed zone. Its route can be watched and learned.
_Avoid_: static guard, patroller

**Roamer**:
A guard that wanders the whole showroom rather than holding a zone. Unpredictable by design.
_Avoid_: wanderer, free guard

### Upgrades

**Upgrade**:
A permanent improvement to the slingshot, hidden in the showroom. Claimed as a boxed flat-pack that must be carried to a self-checkout — you cannot fire while carrying one.
_Avoid_: powerup, perk, pickup

**The Band**:
The upgrade that replaces the slingshot's rubber band, buying reach on a full pull and nothing on a weak one.
_Avoid_: power upgrade, range boost

**Bigger Pouch**:
The upgrade that adds pouch slots, so heavier loadouts become possible.
_Avoid_: bag upgrade, capacity boost

**Self-checkout**:
The machine beside an upgrade that processes its box. An upgrade takes effect here, not where it was found. It chatters audibly while working, and holds the box if you are interrupted.
_Avoid_: till, register, altar

**Receipt**:
What a self-checkout prints when an upgrade is claimed: an itemised slip stating what was taken and what it does, total 0.00. It is how the game explains an upgrade, and it is the joke.
_Avoid_: tooltip, notification, popup

## Conventions

### Deadpan rule

**Content is funny. Delivery is deadpan.**

Jokes live entirely in copy — signage, price tags, product names, PA lines. Nothing in the world ever *performs* a joke. Guards behave like professional security. The store acts as though nothing unusual is happening. Nothing winks at the camera.

The payoff is structural: a new joke is a new string, never a new system, so flavour can be added forever without touching behaviour.

### Umlaut convention

| Context | Form |
|---|---|
| Logo, door sign, in-world text | `FLATPÄK SKRÄPBO` |
| Code, filenames, URLs, page title | `Flatpak Skrapbo` |

The look where it matters, and no keyboard fights anywhere else.
