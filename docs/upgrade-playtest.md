# Upgrade combat playtest

Run `npm run prototype:kill` and open `prototype-kill.html`. This extends the
settled combat playtest; the production showroom snake remains separate work.

Guards hunt by default. The middle guard roams between the six shelf zones.
The other guards patrol Living Rooms and Children's. Turn hunting off in the
tuning panel to inspect the upgrades without pressure.
The combat playtest is 36 by 60 metres, with the Living Rooms shelf immediately
in front of spawn. Guards patrol at 2.2 m/s, chase at 4.8 m/s, and search at
3 m/s. Their sight reaches 12 metres through an 80-degree cone. The
**Guard difficulty** section in the tuning panel exposes all five values.
Guards stop short of the player to attack: their kinematic collision bodies
must not overlap the player and squeeze it through the showroom walls.
Blocked pursuit and patrol routes use a small cached navigation grid built
from the showroom's static box geometry, with clearance for the guard's whole
body. Routes go around shelf ends and wall corners; they do not cut through
them. Search rotation and vision comparisons wrap angles after every full
turn, so a searching guard can still spot you in front of it. An unreachable
destination is shown as **route blocked** in the guard readout.

Find **The Band** on the low display in Bedrooms, then **Bigger Pouch** on the
low display in Children's. Aim at a box and press E to carry it. You cannot
pull or fire while carrying, and your existing FIFO pouch is preserved. Each
box has its own nearby self-checkout: aim at it and press E to deposit.

Processing takes three attended seconds. Leaving its 2.6 m reach, losing line
of sight, taking a hit, dying, unlocking the pointer or leaving the browser
pauses progress and chatter. Return to resume automatically. The box stays
in the machine. You can use your slingshot again after depositing.
At zero hearts the run ends: movement, firing and pickups stop, and a
**Restart playtest** button replaces the click-to-play instructions.

Completion prints the receipt from `src/copy.ts`, activates the upgrade and
leaves a printed slip on the machine. The readable receipt stays on screen
for twelve seconds; look at the self-checkout or press E there to read it
again. The Band is thicker and red and changes only full-pull base speed
from 48 to 62 m/s. All partial pulls retain their original speed. Bigger
Pouch adds three visible slots, from five to eight; two Heavies now fit.

Reset playtest (including changing the kill variant) restores both boxes,
checkout progress, the original band and five-slot pouch. Upgrades last for
the run, not across resets. Boxes and self-checkouts have static colliders;
carried boxes and receipt paper are visual-only, so the existing maximum of
24 debris pieces + 3 corpses + 12 active throwables + player stays at 40
dynamic bodies.

`npm run test:upgrades` covers the shared checkout and upgrade rules.
`npm run test:guards` covers angle wrapping and collision-clear routes.
With the dev server running, `npm run test:upgrades:browser` exercises actual
pickup, firing restrictions, interrupted checkout, receipts, capacity, death,
restart, search reacquisition, corner pursuit and guard pressure at all four
walls and a corner. It uses Edge on
Windows; elsewhere run `npx playwright install chromium` first. Set
`PLAYTEST_URL` for a server other than `http://127.0.0.1:5173`, or
`PLAYWRIGHT_CHANNEL` to select another installed browser.
