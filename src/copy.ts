/**
 * Every word the store says. One table, so a new joke is a new string and never new code
 * (see the deadpan rule in CONTEXT.md).
 *
 * In-world text carries umlauts; ids, filenames and URLs stay plain ASCII.
 *
 * PA rules, settled in "Write the store's voice" (#17):
 *   - The store never notices the player. No line is triggered by anything you do;
 *     every line that fits what you are doing fits by coincidence. Do not add triggers.
 *   - Lines are bored. No exclamation marks, no greetings, no "please enjoy". Full stops.
 *   - Twelve words maximum, so a caption is one line and a recording is about three seconds.
 */

export type ZoneId = 'living' | 'dining' | 'bedrooms' | 'kitchens' | 'childrens' | 'market';

export type TierKey = 'light' | 'medium' | 'heavy';

export type ZoneSign = {
  /** Overhead sign, as seen in world. */
  name: string;
  /** Straight-faced second line. Only where it earns its place. */
  subtitle?: string;
  /** Wayfinding, because the showroom is a one-way snake. */
  next: string;
};

export type Product = {
  id: string;
  zone: ZoneId;
  tier: TierKey;
  /** Invented Scandinavian. Never one letter off a real chain. */
  name: string;
  /** Plain number, no currency symbol, exactly as a real shelf card reads. */
  price: number;
  /** The deadpan lives here, and it quietly tells you the weight tier. */
  descriptor: string;
};

export type PaLine = {
  id: string;
  /** The zone whose pool this belongs to, or generic for the store-wide pool. */
  zone: ZoneId | 'generic';
  text: string;
  /**
   * Loaded lines are about merchandise, breakage, safety or tidiness, so something is
   * nearly always almost relevant. Plain lines are real store ambience and exist so the
   * loaded ones read as coincidence rather than commentary. Roughly two thirds loaded.
   */
  loaded: boolean;
};

export const zoneSigns: Record<ZoneId, ZoneSign> = {
  living: { name: 'LIVING ROOMS', subtitle: 'Somewhere to put the television.', next: 'DINING' },
  dining: { name: 'DINING', next: 'BEDROOMS' },
  bedrooms: { name: 'BEDROOMS', subtitle: 'Sleep is a system.', next: 'KITCHENS' },
  kitchens: { name: 'KITCHENS', next: "CHILDREN'S" },
  childrens: { name: "CHILDREN'S", next: 'MARKET HALL' },
  market: { name: 'MARKET HALL', subtitle: 'Everything here is self service.', next: 'CHECKOUTS' }
};

/**
 * Forty throwables: six per zone at three Light, two Medium, one Heavy, plus ten in the
 * Market Hall (#16). Scenery is deliberately unnamed - a name on something you cannot fire
 * is a joke nobody stops to read.
 */
export const products: Product[] = [
  // Living Rooms
  { id: 'knapp', zone: 'living', tier: 'light', name: 'KNÄPP', price: 4.0, descriptor: 'Remote control holder. Weighs almost nothing.' },
  { id: 'mysa', zone: 'living', tier: 'light', name: 'MYSÄ', price: 6.5, descriptor: 'Cushion. Soft on every side.' },
  { id: 'fladd', zone: 'living', tier: 'light', name: 'FLÄDD', price: 9.0, descriptor: 'Throw. Folds smaller than you expect.' },
  { id: 'vurm', zone: 'living', tier: 'medium', name: 'VÜRM', price: 22.0, descriptor: 'Vase. Carry with two hands.' },
  { id: 'glimt', zone: 'living', tier: 'medium', name: 'GLIMT', price: 35.0, descriptor: 'Table lamp. Bulb not included.' },
  { id: 'hurra', zone: 'living', tier: 'heavy', name: 'HÜRRA', price: 129.0, descriptor: 'Footstool. Ask a colleague to help you lift this.' },

  // Dining
  { id: 'tallrik', zone: 'dining', tier: 'light', name: 'TÄLLRO', price: 2.5, descriptor: 'Side plate. Stacks in sixes.' },
  { id: 'servett', zone: 'dining', tier: 'light', name: 'SERVÄTT', price: 3.0, descriptor: 'Napkin ring. Sold singly.' },
  { id: 'brinna', zone: 'dining', tier: 'light', name: 'BRINNÄ', price: 5.5, descriptor: 'Candle. Burns for nine hours.' },
  { id: 'skalk', zone: 'dining', tier: 'medium', name: 'SKÄLK', price: 18.0, descriptor: 'Salad bowl. Two hands, please.' },
  { id: 'droppa', zone: 'dining', tier: 'medium', name: 'DROPPÄ', price: 24.0, descriptor: 'Water carafe. Heavier when full.' },
  { id: 'sitta', zone: 'dining', tier: 'heavy', name: 'SITTÄ', price: 89.0, descriptor: 'Dining chair. Rated to one hundred and ten kilograms.' },

  // Bedrooms
  { id: 'dunig', zone: 'bedrooms', tier: 'light', name: 'DÜNIG', price: 7.0, descriptor: 'Pillow. Almost no weight at all.' },
  { id: 'tofsa', zone: 'bedrooms', tier: 'light', name: 'TOFSÄ', price: 8.0, descriptor: 'Slipper. Left foot shown.' },
  { id: 'ringla', zone: 'bedrooms', tier: 'light', name: 'RINGLÄ', price: 11.0, descriptor: 'Alarm clock. Batteries not included.' },
  { id: 'skymma', zone: 'bedrooms', tier: 'medium', name: 'SKYMMÄ', price: 29.0, descriptor: 'Bedside lamp. Lift with both hands.' },
  { id: 'spegla', zone: 'bedrooms', tier: 'medium', name: 'SPEGLÄ', price: 45.0, descriptor: 'Mirror. Handle with both hands.' },
  { id: 'lada', zone: 'bedrooms', tier: 'heavy', name: 'LÄDA', price: 110.0, descriptor: 'Wardrobe drawer. Ask a colleague to help you lift this.' },

  // Kitchens
  { id: 'kopp', zone: 'kitchens', tier: 'light', name: 'KÖPP', price: 2.0, descriptor: 'Mug. Holds three hundred millilitres.' },
  { id: 'vispa', zone: 'kitchens', tier: 'light', name: 'VISPÄ', price: 3.5, descriptor: 'Whisk. Lighter than it looks.' },
  { id: 'torka', zone: 'kitchens', tier: 'light', name: 'TÖRKA', price: 4.5, descriptor: 'Tea towel. Absorbs almost anything.' },
  { id: 'koka', zone: 'kitchens', tier: 'medium', name: 'KÖKA', price: 26.0, descriptor: 'Saucepan. Two hands on the handle.' },
  { id: 'anga', zone: 'kitchens', tier: 'medium', name: 'ÄNGA', price: 32.0, descriptor: 'Kettle. Fill to the line only.' },
  { id: 'gryta', zone: 'kitchens', tier: 'heavy', name: 'GRYTÄ', price: 95.0, descriptor: 'Cast iron pot. Ask a colleague to help you lift this.' },

  // Children's
  { id: 'anka', zone: 'childrens', tier: 'light', name: 'ÄNKA', price: 3.0, descriptor: 'Soft duck. Machine washable.' },
  { id: 'kloss', zone: 'childrens', tier: 'light', name: 'KLÖSS', price: 5.0, descriptor: 'Building block. Unsuitable for children under three.' },
  { id: 'skrammel', zone: 'childrens', tier: 'light', name: 'SKRÄMMEL', price: 6.0, descriptor: 'Rattle. Makes a noise when moved.' },
  { id: 'natta', zone: 'childrens', tier: 'medium', name: 'NÄTTA', price: 19.0, descriptor: 'Night light. Carry with two hands.' },
  { id: 'pall', zone: 'childrens', tier: 'medium', name: 'PÄLL', price: 25.0, descriptor: 'Child stool. Heavier than a toy.' },
  { id: 'kista', zone: 'childrens', tier: 'heavy', name: 'KISTÄ', price: 79.0, descriptor: 'Toy chest. Ask a colleague to help you lift this.' },

  // Market Hall
  { id: 'lysa', zone: 'market', tier: 'light', name: 'LYSÄ', price: 4.0, descriptor: 'Tealights. Sold in packs of one hundred.' },
  { id: 'svamp', zone: 'market', tier: 'light', name: 'SVÄMP', price: 1.5, descriptor: 'Sponge. Weighs nothing when dry.' },
  { id: 'duk', zone: 'market', tier: 'light', name: 'DÜK', price: 2.5, descriptor: 'Paper napkins. Fifty per pack.' },
  { id: 'frysa', zone: 'market', tier: 'light', name: 'FRYSÄ', price: 3.0, descriptor: 'Ice tray. Makes fourteen cubes.' },
  { id: 'burk', zone: 'market', tier: 'light', name: 'BÜRK', price: 4.5, descriptor: 'Plastic tub. Lid sold separately.' },
  { id: 'sila', zone: 'market', tier: 'medium', name: 'SILÄ', price: 14.0, descriptor: 'Colander. Two hands when full.' },
  { id: 'stapla', zone: 'market', tier: 'medium', name: 'STAPLÄ', price: 17.0, descriptor: 'Storage box. Stacks four high.' },
  { id: 'ramma', zone: 'market', tier: 'medium', name: 'RÄMMA', price: 21.0, descriptor: 'Picture frame. Glass front, carry carefully.' },
  { id: 'hylla', zone: 'market', tier: 'heavy', name: 'HYLLÄ', price: 65.0, descriptor: 'Flat-pack shelf. Ask a colleague to help you lift this.' },
  { id: 'stekpanna', zone: 'market', tier: 'heavy', name: 'STEKPÄNNA', price: 55.0, descriptor: 'Cast iron skillet. Ask a colleague to help you lift this.' }
];

/**
 * Forty-eight lines: seven per zone plus six store-wide. Played on a timer every 25-40
 * seconds and never interrupted, including mid-chase - a calm announcement while a guard
 * sprints at you is the best joke this system makes.
 */
export const paLines: PaLine[] = [
  // Living Rooms
  { id: 'living-1', zone: 'living', loaded: true, text: 'Cushions are for sitting on. Not for any other purpose.' },
  { id: 'living-2', zone: 'living', loaded: true, text: 'Our footstools are heavier than they appear.' },
  { id: 'living-3', zone: 'living', loaded: true, text: 'A vase has been reported broken in Living Rooms.' },
  { id: 'living-4', zone: 'living', loaded: true, text: 'Our lamps are not designed to be thrown.' },
  { id: 'living-5', zone: 'living', loaded: true, text: 'Remote controls are sold separately from the televisions.' },
  { id: 'living-6', zone: 'living', loaded: false, text: 'The Living Rooms display will be rearranged on Thursday.' },
  { id: 'living-7', zone: 'living', loaded: false, text: 'Seating is available for customers who need to sit down.' },

  // Dining
  { id: 'dining-1', zone: 'dining', loaded: true, text: 'Plates are stacked for your convenience. Please stack them back.' },
  { id: 'dining-2', zone: 'dining', loaded: true, text: 'Breakages must be reported. Most of them are not.' },
  { id: 'dining-3', zone: 'dining', loaded: true, text: 'Our glassware is toughened. It is not unbreakable.' },
  { id: 'dining-4', zone: 'dining', loaded: true, text: 'The dining chairs are rated to one hundred and ten kilograms.' },
  { id: 'dining-5', zone: 'dining', loaded: true, text: 'The candles in Dining are not to be lit.' },
  { id: 'dining-6', zone: 'dining', loaded: false, text: 'Table settings shown are for display purposes only.' },
  { id: 'dining-7', zone: 'dining', loaded: false, text: 'Our dining range is available in three finishes.' },

  // Bedrooms
  { id: 'bedrooms-1', zone: 'bedrooms', loaded: true, text: 'Please do not sleep in the beds.' },
  { id: 'bedrooms-2', zone: 'bedrooms', loaded: true, text: 'The wardrobes are secured to the wall for your safety.' },
  { id: 'bedrooms-3', zone: 'bedrooms', loaded: true, text: 'Mirrors in Bedrooms should be handled with both hands.' },
  { id: 'bedrooms-4', zone: 'bedrooms', loaded: true, text: 'Something has fallen over in Bedrooms. It is fine.' },
  { id: 'bedrooms-5', zone: 'bedrooms', loaded: true, text: 'A colleague is available in Bedrooms if required.' },
  { id: 'bedrooms-6', zone: 'bedrooms', loaded: false, text: 'Pillows are not returnable once removed from the packaging.' },
  { id: 'bedrooms-7', zone: 'bedrooms', loaded: false, text: 'Our mattress guarantee lasts twenty five years.' },

  // Kitchens
  { id: 'kitchens-1', zone: 'kitchens', loaded: true, text: 'Our cast iron is heavy. Please lift it correctly.' },
  { id: 'kitchens-2', zone: 'kitchens', loaded: true, text: 'Crockery is not covered by the accidental damage policy.' },
  { id: 'kitchens-3', zone: 'kitchens', loaded: true, text: 'Please keep the aisles in Kitchens clear.' },
  { id: 'kitchens-4', zone: 'kitchens', loaded: true, text: 'Knives are kept behind the counter for obvious reasons.' },
  { id: 'kitchens-5', zone: 'kitchens', loaded: true, text: 'There is a spillage in Kitchens. Someone will attend.' },
  { id: 'kitchens-6', zone: 'kitchens', loaded: false, text: 'The kitchen display is not connected to the water.' },
  { id: 'kitchens-7', zone: 'kitchens', loaded: false, text: 'Kitchen units are available in nine different finishes.' },

  // Children's
  { id: 'childrens-1', zone: 'childrens', loaded: true, text: 'The toys in this department are for demonstration only.' },
  { id: 'childrens-2', zone: 'childrens', loaded: true, text: 'Please do not climb on the storage units.' },
  { id: 'childrens-3', zone: 'childrens', loaded: true, text: 'Something is being thrown in Children\u2019s. Probably a toy.' },
  { id: 'childrens-4', zone: 'childrens', loaded: true, text: 'Children must be supervised at all times.' },
  { id: 'childrens-5', zone: 'childrens', loaded: false, text: 'A child has been reunited with their parent.' },
  { id: 'childrens-6', zone: 'childrens', loaded: false, text: 'The ball pit is closed until further notice.' },
  { id: 'childrens-7', zone: 'childrens', loaded: false, text: 'Small parts are unsuitable for children under three.' },

  // Market Hall
  { id: 'market-1', zone: 'market', loaded: true, text: 'Please take a trolley if you are carrying several items.' },
  { id: 'market-2', zone: 'market', loaded: true, text: 'Stock levels in the Market Hall are lower than usual.' },
  { id: 'market-3', zone: 'market', loaded: true, text: 'Please do not run in the Market Hall.' },
  { id: 'market-4', zone: 'market', loaded: true, text: 'Items left on the floor will be collected eventually.' },
  { id: 'market-5', zone: 'market', loaded: false, text: 'The Market Hall is our final department.' },
  { id: 'market-6', zone: 'market', loaded: false, text: 'The exit is located past the checkouts.' },
  { id: 'market-7', zone: 'market', loaded: false, text: 'Our tealights are sold in packs of one hundred.' },

  // Store-wide
  { id: 'generic-1', zone: 'generic', loaded: true, text: 'Please do not throw the merchandise.' },
  { id: 'generic-2', zone: 'generic', loaded: true, text: 'Security is aware and is dealing with it.' },
  { id: 'generic-3', zone: 'generic', loaded: true, text: 'Please ensure you have not left anything behind.' },
  { id: 'generic-4', zone: 'generic', loaded: false, text: 'Thank you for shopping at Flatp\u00e4k Skr\u00e4pbo.' },
  { id: 'generic-5', zone: 'generic', loaded: false, text: 'The restaurant closes thirty minutes before the store.' },
  { id: 'generic-6', zone: 'generic', loaded: false, text: 'Would a colleague please attend the returns desk.' }
];

export type Receipt = {
  upgradeId: 'band' | 'pouch';
  /** The line as printed on the slip, itemised. */
  item: string;
  price: number;
  /** What it does. This is how the game explains an upgrade, so it must actually explain it. */
  explanation: string;
};

/**
 * The receipt is the only place an upgrade is explained (#20). Itemised, straight-faced,
 * and the total is always zero.
 */
export const receipts: Record<Receipt['upgradeId'], Receipt> = {
  band: {
    upgradeId: 'band',
    item: 'SPÄNN replacement band',
    price: 0.0,
    explanation: 'Full pull now travels further. A half pull is unchanged.'
  },
  pouch: {
    upgradeId: 'pouch',
    item: 'BÄRA pouch, large',
    price: 0.0,
    explanation: 'Holds eight slots instead of five. Heavy items take three.'
  }
};

export const receiptHeader = 'FLATPÄK SKRÄPBO';
export const receiptFooter = ['TOTAL', '0.00', 'No payment was taken.', 'Please retain this receipt.'];

/** Where a rendered PA line lives, keyed by line id. Plain ASCII, per the umlaut convention. */
export function paAudioUrl(id: string): string {
  return `assets/audio/pa/${id}.mp3`;
}
